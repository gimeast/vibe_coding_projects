import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'
import { getFfmpegPath, requireYtdlp } from '../binaries'
import { humanizeYtdlpError } from '../resolver/errors'
import { getSettings } from '../state'
import type {
  Job,
  JobProgress,
  JobState,
  MediaInfo,
  RequestContext,
  Selection,
} from '../../shared/types'
import { buildDownloadArgs } from './args'
import { parseLine } from './progress'

const EMPTY_PROGRESS: JobProgress = {
  ratio: null,
  downloadedBytes: null,
  totalBytes: null,
  speed: null,
  eta: null,
}

/** 작업 1건. 자기 프로세스의 수명과 상태 전이를 책임진다. */
export class DownloadJob {
  readonly id = randomUUID()
  readonly url: string
  readonly title: string
  readonly thumbnail: string | null
  readonly selection: Selection
  readonly createdAt = Date.now()

  /** 스니퍼가 찾아준 주소면 referer·쿠키가 있어야 받을 수 있다 */
  private readonly request: RequestContext | null
  private readonly viaSniffer: boolean
  private readonly resolvedAt: number

  private state: JobState = 'queued'
  private progress: JobProgress = { ...EMPTY_PROGRESS }
  private outputPath: string | null = null
  private error: string | null = null

  private child: ChildProcess | null = null
  private canceled = false
  /** 취소 시 정리할 부분 파일 경로 */
  private destinations = new Set<string>()
  private stderrTail: string[] = []

  constructor(
    info: MediaInfo,
    selection: Selection,
    private readonly onChange: (job: Job) => void,
  ) {
    this.url = info.sourceUrl
    this.title = info.title
    this.thumbnail = info.thumbnail
    this.selection = selection
    this.request = info.request
    this.viaSniffer = info.via === 'sniffer'
    this.resolvedAt = info.resolvedAt
  }

  snapshot(): Job {
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      thumbnail: this.thumbnail,
      state: this.state,
      selection: this.selection,
      progress: this.progress,
      outputPath: this.outputPath,
      error: this.error,
      createdAt: this.createdAt,
    }
  }

  private emit(): void {
    this.onChange(this.snapshot())
  }

  private transition(state: JobState): void {
    // 취소가 확정된 뒤 늦게 도착한 프로세스 이벤트가 상태를 되돌리지 않도록
    if (this.state === 'canceled' || this.state === 'failed') return
    this.state = state
    this.emit()
  }

  async run(): Promise<void> {
    if (this.canceled) return

    let bin: string
    let ffmpegPath: string | null
    try {
      bin = await requireYtdlp()
      ffmpegPath = await getFfmpegPath()
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err))
      return
    }

    const args = buildDownloadArgs(
      this.url,
      this.selection,
      getSettings(),
      ffmpegPath,
      this.request,
      this.viaSniffer ? this.title : null,
    )
    this.transition('downloading')

    await new Promise<void>((resolve) => {
      const child = spawn(bin, args, { windowsHide: true })
      this.child = child

      this.consume(child.stdout)
      this.consume(child.stderr, true)

      child.on('error', (err) => {
        this.fail(`yt-dlp 실행에 실패했습니다: ${err.message}`)
        resolve()
      })

      child.on('close', (code) => {
        this.child = null
        if (this.canceled) {
          void this.cleanupPartials()
        } else if (code === 0) {
          this.transition('done')
        } else {
          this.fail(this.explainFailure(this.stderrTail.join('\n')))
        }
        resolve()
      })
    })
  }

  private consume(stream: Readable | null, isStderr = false): void {
    if (!stream) return

    createInterface({ input: stream }).on('line', (line) => {
      if (isStderr) {
        this.stderrTail.push(line)
        // 실패 진단에는 끝부분이면 충분하다
        if (this.stderrTail.length > 40) this.stderrTail.shift()
      }

      const parsed = parseLine(line)
      switch (parsed.kind) {
        case 'progress':
          this.progress = parsed.progress
          if (this.state === 'downloading') this.emit()
          break
        case 'destination':
          this.destinations.add(parsed.path)
          break
        case 'postprocess':
          this.transition('muxing')
          break
        case 'final':
          this.outputPath = parsed.path
          break
        case 'other':
          break
      }
    })
  }

  /**
   * 스니퍼로 찾은 주소에는 만료 토큰이 붙어 있는 경우가 많다 (px-time, Expires 등).
   * 해석 후 한참 뒤에 받으면 403/410 이 나는데, 일반 권한 오류로 안내하면
   * 사용자가 로그인만 반복하게 된다. 시간 경과를 근거로 갈라준다.
   */
  private explainFailure(stderr: string): string {
    const looksExpired = /HTTP Error 40[13]|HTTP Error 410|Unable to download|expired/i.test(
      stderr,
    )
    const elapsedMin = Math.round((Date.now() - this.resolvedAt) / 60_000)

    if (this.viaSniffer && looksExpired && elapsedMin >= 3) {
      return `주소가 만료된 것 같습니다 (찾은 지 ${elapsedMin}분 경과). 이런 주소는 대개 짧은 유효기간이 걸려 있으니, 다시 찾기를 눌러 새로 받아 주세요.`
    }
    return humanizeYtdlpError(stderr)
  }

  private fail(message: string): void {
    if (this.state === 'canceled') return
    this.error = message
    this.state = 'failed'
    this.emit()
  }

  cancel(): void {
    if (this.state === 'done' || this.state === 'failed') return

    this.canceled = true
    this.state = 'canceled'
    this.emit()

    if (this.child?.pid) {
      killTree(this.child.pid)
    } else {
      // 아직 시작 전이면 정리할 것도 없다
      void this.cleanupPartials()
    }
  }

  /** yt-dlp 는 받는 중인 파일을 `<dest>.part` 로 쓴다. 둘 다 지운다. */
  private async cleanupPartials(): Promise<void> {
    await Promise.all(
      [...this.destinations].flatMap((dest) =>
        [dest, `${dest}.part`].map((p) => rm(p, { force: true }).catch(() => {})),
      ),
    )
  }
}

/**
 * yt-dlp 는 병합을 위해 ffmpeg 를 자식으로 띄우므로 프로세스 트리째 죽여야 한다.
 * SIGTERM 만 보내면 ffmpeg 가 남아 파일을 붙들고 있는 경우가 생긴다.
 */
function killTree(pid: number): void {
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
    return
  }
  try {
    // spawn 에 detached 를 주지 않았으므로 프로세스 그룹 대신 개별 종료 후
    // 자식은 부모가 죽으면서 함께 정리되도록 SIGKILL 로 확실히 끊는다
    process.kill(pid, 'SIGKILL')
  } catch {
    // 이미 죽었다
  }
}
