import type { Job, JobState } from '@shared/types'
import { formatBytes, formatEta, formatSpeed } from '../lib/format'

const STATE_LABEL: Record<JobState, string> = {
  queued: '대기 중',
  resolving: '분석 중',
  downloading: '받는 중',
  muxing: '병합 중',
  done: '완료',
  failed: '실패',
  canceled: '취소됨',
}

const ACTIVE_STATES: JobState[] = ['queued', 'resolving', 'downloading', 'muxing']

interface Props {
  jobs: Job[]
  onCancel: (id: string) => void
  onRemove: (id: string) => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
}

function ProgressBar({ job }: { job: Job }) {
  const ratio = job.progress.ratio
  const indeterminate = ratio === null

  return (
    <div className={indeterminate ? 'bar bar-indeterminate' : 'bar'}>
      <div
        className="bar-fill"
        style={indeterminate ? undefined : { width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  )
}

function JobRow({ job, onCancel, onRemove, onReveal, onOpen }: { job: Job } & Omit<Props, 'jobs'>) {
  const active = ACTIVE_STATES.includes(job.state)
  const { downloadedBytes, totalBytes, speed, eta, ratio } = job.progress

  return (
    <li className={`job job-${job.state}`}>
      {job.thumbnail ? (
        <img className="job-thumb" src={job.thumbnail} alt="" />
      ) : (
        <div className="job-thumb thumb-empty" />
      )}

      <div className="job-body">
        <div className="job-title" title={job.title}>
          {job.title}
        </div>

        {active ? (
          <>
            <ProgressBar job={job} />
            <div className="job-stats muted">
              <span>{STATE_LABEL[job.state]}</span>
              {job.state === 'downloading' ? (
                <>
                  <span>
                    {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                    {ratio !== null ? ` (${Math.round(ratio * 100)}%)` : ''}
                  </span>
                  <span>{formatSpeed(speed)}</span>
                  <span>{formatEta(eta)}</span>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="job-stats muted">
            <span className={job.state === 'failed' ? 'error-text' : undefined}>
              {job.error ?? STATE_LABEL[job.state]}
            </span>
          </div>
        )}
      </div>

      <div className="job-actions">
        {active ? (
          <button type="button" onClick={() => onCancel(job.id)}>
            취소
          </button>
        ) : (
          <>
            {job.state === 'done' && job.outputPath ? (
              <>
                <button type="button" onClick={() => onOpen(job.outputPath as string)}>
                  열기
                </button>
                <button type="button" onClick={() => onReveal(job.outputPath as string)}>
                  폴더
                </button>
              </>
            ) : null}
            <button type="button" onClick={() => onRemove(job.id)}>
              지우기
            </button>
          </>
        )}
      </div>
    </li>
  )
}

export default function JobList({ jobs, ...handlers }: Props) {
  if (jobs.length === 0) return null

  return (
    <section className="jobs">
      <h3>다운로드</h3>
      <ul>
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} {...handlers} />
        ))}
      </ul>
    </section>
  )
}
