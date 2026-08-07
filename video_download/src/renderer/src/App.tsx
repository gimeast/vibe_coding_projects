import { useCallback, useEffect, useState } from 'react'
import type { BinaryStatus, Job, MediaInfo, Selection, Settings } from '@shared/types'
import JobList from './components/JobList'
import MediaCard from './components/MediaCard'

export default function App() {
  const [url, setUrl] = useState('')
  const [resolving, setResolving] = useState(false)
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [binaries, setBinaries] = useState<BinaryStatus | null>(null)
  const [updateNote, setUpdateNote] = useState<string | null>(null)

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
    void window.api.binaries.status().then(setBinaries)
    void window.api.download.list().then(setJobs)

    return window.api.download.onUpdate((updated) => {
      setJobs((prev) => {
        const index = prev.findIndex((j) => j.id === updated.id)
        if (index === -1) return [updated, ...prev]
        const next = [...prev]
        next[index] = updated
        return next
      })
    })
  }, [])

  const handleResolve = useCallback(async () => {
    if (!url.trim() || resolving) return

    setResolving(true)
    setError(null)
    setInfo(null)

    const result = await window.api.resolve(url)
    if (result.ok) setInfo(result.value)
    else setError(result.error)

    setResolving(false)
  }, [url, resolving])

  const handleDownload = useCallback(
    async (selection: Selection) => {
      if (!info) return
      await window.api.download.start(info, selection)
      // 카드를 닫아 다음 URL 을 바로 붙여넣을 수 있게 한다
      setInfo(null)
      setUrl('')
    },
    [info],
  )

  const handleChooseDir = useCallback(async () => {
    const dir = await window.api.settings.chooseDir()
    if (dir) setSettings((prev) => (prev ? { ...prev, downloadDir: dir } : prev))
  }, [])

  const handleUpdateYtdlp = useCallback(async () => {
    setUpdateNote('업데이트 확인 중…')
    const result = await window.api.binaries.update()
    setUpdateNote(result.message)
    setBinaries(await window.api.binaries.status(true))
  }, [])

  const ytdlpMissing = binaries?.ytdlp.source === 'missing'

  return (
    <div className="app">
      <header className="titlebar">
        <span className="brand">Video Download</span>
      </header>

      <main>
        <section className="url-bar">
          <input
            type="url"
            value={url}
            placeholder="동영상이 있는 페이지 주소를 붙여넣으세요"
            spellCheck={false}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleResolve()
            }}
          />
          <button
            type="button"
            className="primary"
            disabled={resolving || !url.trim()}
            onClick={() => void handleResolve()}
          >
            {resolving ? '찾는 중…' : '찾기'}
          </button>
        </section>

        {ytdlpMissing ? (
          <div className="banner error">
            yt-dlp 를 찾지 못했습니다. 설치한 뒤 앱을 다시 실행해 주세요.
          </div>
        ) : null}

        {error ? <div className="banner error">{error}</div> : null}

        {info ? (
          <MediaCard info={info} onDownload={(s) => void handleDownload(s)} />
        ) : null}

        <JobList
          jobs={jobs}
          onCancel={(id) => void window.api.download.cancel(id)}
          onRemove={(id) => void window.api.download.remove(id)}
          onReveal={(path) => void window.api.shell.reveal(path)}
          onOpen={(path) => void window.api.shell.open(path)}
        />
      </main>

      <footer className="statusbar">
        <button type="button" className="link-button" onClick={() => void handleChooseDir()}>
          저장 위치: <span className="mono">{settings?.downloadDir ?? '…'}</span>
        </button>

        <div className="statusbar-right">
          {updateNote ? <span className="muted">{updateNote}</span> : null}
          <span className="muted mono">
            yt-dlp {binaries?.ytdlp.version ?? '없음'} · ffmpeg{' '}
            {binaries?.ffmpeg.version ?? '없음'}
          </span>
          <button type="button" className="link-button" onClick={() => void handleUpdateYtdlp()}>
            업데이트
          </button>
        </div>
      </footer>
    </div>
  )
}
