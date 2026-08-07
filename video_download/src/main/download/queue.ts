import type { Job, MediaInfo, Selection } from '../../shared/types'
import { DownloadJob } from './job'

/** Phase 3 에서 설정으로 뺄 예정. 그때까지는 무난한 기본값으로 고정. */
const MAX_CONCURRENT = 2

type Listener = (job: Job) => void

/**
 * 작업 목록과 동시 실행 수를 관리한다.
 *
 * 완료된 작업도 목록에 남겨 둔다 — 렌더러가 결과와 파일 경로를 계속 보여줘야 하고,
 * 히스토리(이후 단계)의 자리도 여기가 된다.
 */
class DownloadQueue {
  private jobs = new Map<string, DownloadJob>()
  private pending: DownloadJob[] = []
  private running = 0
  private listeners = new Set<Listener>()

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(job: Job): void {
    for (const listener of this.listeners) listener(job)
  }

  enqueue(info: MediaInfo, selection: Selection): Job {
    const job = new DownloadJob(info, selection, (snapshot) => this.notify(snapshot))
    this.jobs.set(job.id, job)
    this.pending.push(job)

    this.notify(job.snapshot())
    this.pump()
    return job.snapshot()
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return

    // 아직 시작 전이면 대기열에서도 빼야 한다
    this.pending = this.pending.filter((p) => p !== job)
    job.cancel()
  }

  remove(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return

    job.cancel()
    this.pending = this.pending.filter((p) => p !== job)
    this.jobs.delete(id)
  }

  list(): Job[] {
    return [...this.jobs.values()]
      .map((j) => j.snapshot())
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  private pump(): void {
    while (this.running < MAX_CONCURRENT && this.pending.length > 0) {
      const job = this.pending.shift()
      if (!job) break

      this.running += 1
      void job.run().finally(() => {
        this.running -= 1
        this.pump()
      })
    }
  }

  /** 앱 종료 시 남은 프로세스를 정리한다. */
  cancelAll(): void {
    this.pending = []
    for (const job of this.jobs.values()) job.cancel()
  }
}

export const queue = new DownloadQueue()
