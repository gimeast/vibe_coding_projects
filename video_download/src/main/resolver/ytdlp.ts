import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { requireYtdlp } from '../binaries'
import type { MediaFormat, MediaInfo } from '../../shared/types'

const execFileAsync = promisify(execFile)

/** yt-dlp --dump-single-json 출력 중 우리가 쓰는 필드만. 전부 optional 로 둔다. */
interface RawFormat {
  format_id?: string
  ext?: string
  resolution?: string
  width?: number | null
  height?: number | null
  fps?: number | null
  vcodec?: string | null
  acodec?: string | null
  filesize?: number | null
  filesize_approx?: number | null
  tbr?: number | null
  format_note?: string | null
  protocol?: string | null
}

interface RawInfo {
  _type?: string
  id?: string
  title?: string
  thumbnail?: string | null
  duration?: number | null
  uploader?: string | null
  extractor_key?: string | null
  extractor?: string | null
  webpage_url?: string | null
  formats?: RawFormat[]
  entries?: RawInfo[]
}

function isPresent(codec: string | null | undefined): boolean {
  return !!codec && codec !== 'none'
}

function normalizeFormat(raw: RawFormat): MediaFormat {
  const hasVideo = isPresent(raw.vcodec)
  const hasAudio = isPresent(raw.acodec)

  const exact = raw.filesize ?? null
  const approx = raw.filesize_approx ?? null

  return {
    formatId: raw.format_id ?? '',
    ext: raw.ext ?? '',
    resolution: raw.resolution ?? (hasVideo ? '' : 'audio only'),
    width: raw.width ?? null,
    height: raw.height ?? null,
    fps: raw.fps ?? null,
    vcodec: hasVideo ? (raw.vcodec ?? null) : null,
    acodec: hasAudio ? (raw.acodec ?? null) : null,
    filesize: exact ?? approx,
    filesizeIsEstimate: exact === null && approx !== null,
    tbr: raw.tbr ?? null,
    note: raw.format_note ?? null,
    protocol: raw.protocol ?? null,
    hasVideo,
    hasAudio,
  }
}

/** 화질 좋은 순 → 오디오 전용은 뒤로. 고급 목록에서 위쪽이 쓸 만하도록. */
function sortFormats(formats: MediaFormat[]): MediaFormat[] {
  return [...formats].sort((a, b) => {
    if (a.hasVideo !== b.hasVideo) return a.hasVideo ? -1 : 1
    if ((b.height ?? 0) !== (a.height ?? 0)) return (b.height ?? 0) - (a.height ?? 0)
    if ((b.fps ?? 0) !== (a.fps ?? 0)) return (b.fps ?? 0) - (a.fps ?? 0)
    return (b.tbr ?? 0) - (a.tbr ?? 0)
  })
}

function normalizeInfo(
  raw: RawInfo,
  originalUrl: string,
  via: MediaInfo['via'],
): MediaInfo {
  // 재생목록이면 첫 항목만 취한다. 일괄 다운로드는 이후 단계 과제.
  let node = raw
  let playlistCount: number | null = null

  if (raw._type === 'playlist' && Array.isArray(raw.entries) && raw.entries.length > 0) {
    playlistCount = raw.entries.length
    node = raw.entries[0]
  }

  const formats = (node.formats ?? [])
    .map(normalizeFormat)
    .filter((f) => f.formatId && (f.hasVideo || f.hasAudio))

  return {
    sourceUrl: node.webpage_url ?? originalUrl,
    originalUrl,
    id: node.id ?? '',
    title: node.title ?? '(제목 없음)',
    thumbnail: node.thumbnail ?? null,
    duration: node.duration ?? null,
    uploader: node.uploader ?? null,
    extractor: node.extractor_key ?? node.extractor ?? null,
    formats: sortFormats(formats),
    playlistCount,
    via,
  }
}

/**
 * 1차 경로: yt-dlp 추출기로 메타데이터를 받아온다.
 *
 * 실패는 정상 흐름이다 — yt-dlp 가 모르는 사이트면 여기서 떨어지고
 * 호출부가 스니퍼(2차 경로)로 폴백한다. 그래서 throw 대신 null 을 반환한다.
 */
export async function probeWithYtdlp(
  url: string,
  opts: { extraArgs?: string[]; via?: MediaInfo['via'] } = {},
): Promise<{ info: MediaInfo } | { info: null; stderr: string }> {
  const bin = await requireYtdlp()

  const args = [
    '--dump-single-json',
    '--no-warnings',
    '--no-playlist-reverse',
    // 재생목록 URL 이라도 앞쪽 몇 개만 훑어 응답을 빠르게 유지
    '--playlist-end',
    '20',
    ...(opts.extraArgs ?? []),
    url,
  ]

  try {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024, // 포맷이 많은 영상은 JSON 이 꽤 커진다
    })
    const raw = JSON.parse(stdout) as RawInfo
    return { info: normalizeInfo(raw, url, opts.via ?? 'ytdlp') }
  } catch (err) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr)
        : err instanceof Error
          ? err.message
          : String(err)
    return { info: null, stderr }
  }
}
