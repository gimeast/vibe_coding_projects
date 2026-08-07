import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { requireYtdlp } from '../binaries'
import type { MediaFormat, MediaInfo, RequestContext } from '../../shared/types'

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
  /** 실제로 yt-dlp 에 넘긴 주소. 스니퍼 경로에서는 매니페스트 주소다 */
  fetchUrl: string,
  /** 사용자에게 보여줄 원본 페이지 주소 */
  displayUrl: string,
  via: MediaInfo['via'],
  request: RequestContext | null,
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
    // 스니퍼 경로에서는 반드시 낚아챈 매니페스트 주소로 받아야 한다.
    // webpage_url 을 신뢰하면 generic 추출기가 채워 넣은 값에 휘둘린다.
    sourceUrl: via === 'sniffer' ? fetchUrl : (node.webpage_url ?? fetchUrl),
    originalUrl: displayUrl,
    id: node.id ?? '',
    title: node.title ?? '(제목 없음)',
    thumbnail: node.thumbnail ?? null,
    duration: node.duration ?? null,
    uploader: node.uploader ?? null,
    extractor: node.extractor_key ?? node.extractor ?? null,
    formats: sortFormats(formats),
    playlistCount,
    via,
    request,
    resolvedAt: Date.now(),
  }
}

/**
 * 우리가 고쳐 쓴 매니페스트를 넘길 때만 file:// 을 허용한다.
 * yt-dlp 가 기본적으로 막아 둔 기능이라, 사용자 입력 URL 에는 절대 붙이지 않는다.
 */
export function localManifestArgs(url: string): string[] {
  return url.startsWith('file://') ? ['--enable-file-urls'] : []
}

/** referer / UA / 쿠키를 yt-dlp 인자로 옮긴다. 해석과 다운로드가 같은 조건을 써야 한다. */
export function requestArgs(request: RequestContext | null): string[] {
  if (!request) return []
  return [
    ...(request.referer ? ['--referer', request.referer] : []),
    ...(request.userAgent ? ['--user-agent', request.userAgent] : []),
    ...(request.cookieFile ? ['--cookies', request.cookieFile] : []),
  ]
}

/**
 * 1차 경로: yt-dlp 추출기로 메타데이터를 받아온다.
 *
 * 실패는 정상 흐름이다 — yt-dlp 가 모르는 사이트면 여기서 떨어지고
 * 호출부가 스니퍼(2차 경로)로 폴백한다. 그래서 throw 대신 null 을 반환한다.
 */
export async function probeWithYtdlp(
  url: string,
  opts: {
    extraArgs?: string[]
    via?: MediaInfo['via']
    request?: RequestContext | null
    /** 표시에 쓸 원본 페이지 주소. 스니퍼 경로에서는 매니페스트 주소와 다르다 */
    displayUrl?: string
  } = {},
): Promise<{ info: MediaInfo } | { info: null; stderr: string }> {
  const bin = await requireYtdlp()

  const args = [
    '--dump-single-json',
    '--no-warnings',
    '--no-playlist-reverse',
    // 재생목록 URL 이라도 앞쪽 몇 개만 훑어 응답을 빠르게 유지
    '--playlist-end',
    '20',
    ...requestArgs(opts.request ?? null),
    ...localManifestArgs(url),
    ...(opts.extraArgs ?? []),
    url,
  ]

  try {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024, // 포맷이 많은 영상은 JSON 이 꽤 커진다
    })
    const raw = JSON.parse(stdout) as RawInfo
    return {
      info: normalizeInfo(
        raw,
        url,
        opts.displayUrl ?? url,
        opts.via ?? 'ytdlp',
        opts.request ?? null,
      ),
    }
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
