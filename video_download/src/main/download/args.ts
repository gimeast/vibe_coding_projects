import { join } from 'node:path'
import type { PresetId, RequestContext, Selection, Settings } from '../../shared/types'
import { localManifestArgs, requestArgs } from '../resolver/ytdlp'

/** 파일명에 쓸 수 없는 문자 + 제어문자 */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g')

/**
 * 스니퍼로 받은 매니페스트에는 쓸 만한 제목이 없다 — `%(title)s` 가 `adaptive`
 * 같은 파일명으로 잡힌다. 페이지에서 긁은 제목으로 출력 이름을 직접 만든다.
 */
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(ILLEGAL_FILENAME_CHARS, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '') // 윈도우는 끝에 오는 점·공백을 싫어한다
    .slice(0, 120)
    .trim()

  // `%` 를 남겨 두면 yt-dlp 가 출력 템플릿 필드로 해석한다
  return (cleaned || 'video').replace(/%/g, '%%')
}

/** 진행률 한 줄이 이 접두사로 시작한다. progress.ts 와 짝을 이룸. */
export const PROGRESS_PREFIX = 'PROG|'
export const FINAL_PREFIX = 'FINAL|'

const PROGRESS_TEMPLATE =
  `${PROGRESS_PREFIX}%(progress.downloaded_bytes)s` +
  '|%(progress.total_bytes)s' +
  '|%(progress.total_bytes_estimate)s' +
  '|%(progress.speed)s' +
  '|%(progress.eta)s'

interface PresetArgs {
  format: string
  extra: string[]
}

const PRESET_ARGS: Record<PresetId, PresetArgs> = {
  'best-mp4': {
    // mp4/m4a 조합을 우선 시도하고, 없으면 아무 조합이나 받아 mp4 로 병합
    format: 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
    extra: ['--merge-output-format', 'mp4'],
  },
  'max-1080p': {
    format: 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b',
    extra: ['--merge-output-format', 'mp4'],
  },
  'max-720p': {
    format: 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b',
    extra: ['--merge-output-format', 'mp4'],
  },
  'audio-m4a': {
    // m4a 원본이 있으면 재인코딩 없이 추출된다
    format: 'ba[ext=m4a]/ba/b',
    extra: ['-x', '--audio-format', 'm4a'],
  },
  'audio-mp3': {
    format: 'ba/b',
    extra: ['-x', '--audio-format', 'mp3', '--audio-quality', '0'],
  },
}

function selectionArgs(selection: Selection): string[] {
  if (selection.kind === 'preset') {
    const preset = PRESET_ARGS[selection.presetId]
    return ['-f', preset.format, ...preset.extra]
  }

  const spec = selection.mergeAudio
    ? `${selection.formatId}+ba/${selection.formatId}`
    : selection.formatId
  return ['-f', spec, '--merge-output-format', 'mp4']
}

export function buildDownloadArgs(
  url: string,
  selection: Selection,
  settings: Settings,
  ffmpegPath: string | null,
  request: RequestContext | null,
  /** 스니퍼 경로에서 페이지 제목을 파일명으로 쓰기 위한 값. 1차 경로면 null */
  titleOverride: string | null,
): string[] {
  const outputTemplate = titleOverride
    ? `${sanitizeFilename(titleOverride)}.%(ext)s`
    : settings.filenameTemplate

  return [
    ...selectionArgs(selection),

    // 해석 때와 같은 조건으로 요청해야 한다. referer 나 쿠키가 빠지면 403 이 난다.
    ...requestArgs(request),
    ...localManifestArgs(url),

    '-o',
    join(settings.downloadDir, outputTemplate),

    // 재생목록 URL 이라도 단일 항목만. 일괄 다운로드는 이후 단계 과제.
    '--no-playlist',

    // 진행률을 한 줄씩 기계가 읽기 좋은 형태로. 기본 출력은 \r 기반이라 파싱이 어렵다.
    '--newline',
    '--no-colors',
    '--progress',
    '--progress-template',
    PROGRESS_TEMPLATE,

    // --print 는 --simulate 를 함의하므로 --no-simulate 로 되돌려야 실제로 받는다
    '--print',
    `after_move:${FINAL_PREFIX}%(filepath)s`,
    '--no-simulate',

    '--no-warnings',
    ...(ffmpegPath ? ['--ffmpeg-location', ffmpegPath] : []),

    url,
  ]
}
