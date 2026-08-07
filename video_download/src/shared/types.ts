/** main / preload / renderer 가 공유하는 타입. 런타임 코드를 두지 말 것. */

// ---------------------------------------------------------------- 미디어 정보

export interface MediaFormat {
  formatId: string
  ext: string
  /** "1920x1080" 또는 오디오 전용이면 "audio only" */
  resolution: string
  width: number | null
  height: number | null
  fps: number | null
  vcodec: string | null
  acodec: string | null
  /** 바이트. 정확한 값이 없으면 추정치, 그것도 없으면 null */
  filesize: number | null
  filesizeIsEstimate: boolean
  /** 총 비트레이트 (kbps) */
  tbr: number | null
  /** yt-dlp 가 붙이는 라벨. "1080p", "DASH video" 등 */
  note: string | null
  protocol: string | null
  hasVideo: boolean
  hasAudio: boolean
}

export interface MediaInfo {
  /** 실제로 해석에 성공한 URL. 스니퍼를 거친 경우 원본과 다를 수 있다 */
  sourceUrl: string
  originalUrl: string
  id: string
  title: string
  thumbnail: string | null
  /** 초 */
  duration: number | null
  uploader: string | null
  extractor: string | null
  formats: MediaFormat[]
  /** 재생목록에서 첫 항목만 취한 경우 전체 개수. 단일 영상이면 null */
  playlistCount: number | null
  /** 어느 경로로 찾았는지 */
  via: 'ytdlp' | 'sniffer'
}

// ------------------------------------------------------------------- 프리셋

export type PresetId =
  | 'best-mp4'
  | 'max-1080p'
  | 'max-720p'
  | 'audio-m4a'
  | 'audio-mp3'

export interface Preset {
  id: PresetId
  label: string
  description: string
  audioOnly: boolean
}

export const PRESETS: Preset[] = [
  {
    id: 'best-mp4',
    label: '최고 화질',
    description: 'MP4 로 병합',
    audioOnly: false,
  },
  {
    id: 'max-1080p',
    label: '1080p 이하',
    description: '용량과 화질 균형',
    audioOnly: false,
  },
  {
    id: 'max-720p',
    label: '720p 이하',
    description: '가볍게 보관',
    audioOnly: false,
  },
  {
    id: 'audio-m4a',
    label: '오디오 (M4A)',
    description: '재인코딩 없음',
    audioOnly: true,
  },
  {
    id: 'audio-mp3',
    label: '오디오 (MP3)',
    description: '호환성 우선',
    audioOnly: true,
  },
]

/** 프리셋 대신 고급 목록에서 포맷을 직접 고른 경우 */
export interface FormatSelection {
  kind: 'format'
  formatId: string
  /**
   * 영상 전용 포맷이라 별도 오디오를 붙여야 하는지.
   * 이미 오디오가 있는 포맷에 `+ba` 를 붙이면 오디오 트랙이 둘 생기므로
   * 선택 시점에 판단해서 넘긴다.
   */
  mergeAudio: boolean
}

export interface PresetSelection {
  kind: 'preset'
  presetId: PresetId
}

export type Selection = PresetSelection | FormatSelection

// -------------------------------------------------------------------- 작업

export type JobState =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'muxing'
  | 'done'
  | 'failed'
  | 'canceled'

export interface JobProgress {
  /** 0..1. 총 크기를 모르면 null */
  ratio: number | null
  downloadedBytes: number | null
  totalBytes: number | null
  /** 바이트/초 */
  speed: number | null
  /** 초 */
  eta: number | null
}

export interface Job {
  id: string
  url: string
  title: string
  thumbnail: string | null
  state: JobState
  selection: Selection
  progress: JobProgress
  /** 완료 시 최종 파일 경로 */
  outputPath: string | null
  /** 실패 시 사람이 읽을 수 있게 다듬은 메시지 */
  error: string | null
  createdAt: number
}

// ---------------------------------------------------------------- 바이너리

export interface BinaryInfo {
  path: string
  version: string | null
  /** 동봉된 바이너리인지, 시스템 PATH 에서 찾은 것인지 */
  source: 'bundled' | 'system' | 'missing'
}

export interface BinaryStatus {
  ytdlp: BinaryInfo
  ffmpeg: BinaryInfo
  /** yt-dlp 를 마지막으로 갱신한 시각 (epoch ms). 없으면 null */
  lastUpdateCheck: number | null
}

// -------------------------------------------------------------------- 설정

export interface Settings {
  downloadDir: string
  /** yt-dlp output 템플릿 */
  filenameTemplate: string
  /** 자동 업데이트 확인 주기 (일). 0 이면 끔 */
  updateIntervalDays: number
}

// ------------------------------------------------------------------- 결과

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }
