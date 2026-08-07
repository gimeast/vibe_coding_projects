/**
 * 헤드리스 진단 진입점. GUI 없이 해석 파이프라인만 돌려본다.
 *
 *   npm run build && npm run probe -- "<url>"
 *
 * 스니퍼는 창을 띄우고 재생을 유도해야 해서 단위 테스트로 잡기 어렵다.
 * 실제 사이트를 상대로 파이프라인을 확인할 때 이걸 쓴다.
 */
import { app } from 'electron'
import { getBinaryStatus } from './binaries'
import { queue } from './download/queue'
import { resolve } from './resolver'
import { updateSettings } from './state'
import type { Job, MediaInfo, Selection } from '../shared/types'

/**
 * 스니퍼가 숨김 창을 파괴하면 `window-all-closed` 가 발생하는데, 리스너가 하나도
 * 없으면 Electron 이 기본 동작으로 앱을 종료해 버린다. 결과를 찍기도 전에 죽는다.
 * (본 앱은 메인 창이 항상 떠 있어 문제가 되지 않는다)
 */
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const url = process.argv.find((a) => /^https?:\/\//i.test(a))
  if (!url) {
    console.error('사용법: npm run probe -- "<url>"')
    app.exit(2)
    return
  }

  const status = await getBinaryStatus()
  console.log(
    `yt-dlp ${status.ytdlp.version ?? '없음'} (${status.ytdlp.source})  |  appPath=${app.getAppPath()}`,
  )

  const started = Date.now()
  const result = await resolve(url)
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  if (!result.ok) {
    // app.exit 이 stderr 플러시 전에 죽이는 일이 있어 stdout 으로 낸다
    console.log(`실패 (${elapsed}s): ${result.error}`)
    app.exit(1)
    return
  }

  const info = result.value
  console.log(
    JSON.stringify(
      {
        elapsedSec: Number(elapsed),
        via: info.via,
        title: info.title,
        thumbnail: info.thumbnail ? `${info.thumbnail.slice(0, 70)}…` : null,
        duration: info.duration,
        originalUrl: info.originalUrl,
        sourceUrl: info.sourceUrl,
        request: info.request && {
          referer: info.request.referer,
          userAgent: `${(info.request.userAgent ?? '').slice(0, 60)}…`,
          cookieFile: info.request.cookieFile ? '(있음)' : null,
        },
        formatCount: info.formats.length,
        formats: info.formats.map((f) => ({
          id: f.formatId,
          res: f.resolution,
          ext: f.ext,
          v: f.vcodec,
          a: f.acodec,
          tbr: f.tbr,
        })),
      },
      null,
      2,
    ),
  )

  if (!process.argv.includes('--download')) {
    app.exit(0)
    return
  }

  const outDir = process.env.PROBE_OUT_DIR ?? app.getPath('temp')
  updateSettings({ downloadDir: outDir })
  console.log(`\n--- 다운로드 검증 (${outDir}) ---`)

  const ok = await runSmallestDownload(info)
  app.exit(ok ? 0 : 1)
})

/** 가장 작은 영상 포맷 + 오디오 병합. 파이프라인 전체를 최소 용량으로 훑는다. */
function smallestSelection(info: MediaInfo): Selection | null {
  const videos = info.formats.filter((f) => f.hasVideo)
  if (videos.length === 0) return null

  const smallest = videos.reduce((a, b) => ((a.height ?? 0) <= (b.height ?? 0) ? a : b))
  return {
    kind: 'format',
    formatId: smallest.formatId,
    mergeAudio: !smallest.hasAudio,
  }
}

function runSmallestDownload(info: MediaInfo): Promise<boolean> {
  const selection = smallestSelection(info)
  if (!selection) {
    console.error('영상 포맷이 없어 다운로드를 건너뜁니다.')
    return Promise.resolve(false)
  }

  return new Promise((done) => {
    let last = ''
    const stop = queue.onChange((job: Job) => {
      const line = `${job.state} ${job.progress.ratio !== null ? `${Math.round(job.progress.ratio * 100)}%` : ''}`
      if (line !== last) {
        console.log('  ' + line)
        last = line
      }

      if (job.state === 'done') {
        console.log(`  → ${job.outputPath}`)
        stop()
        done(true)
      } else if (job.state === 'failed' || job.state === 'canceled') {
        // app.exit 이 stderr 플러시 전에 죽이는 일이 있어 stdout 으로 낸다
        console.log(`  실패: ${job.error}`)
        stop()
        done(false)
      }
    })

    queue.enqueue(info, selection)
  })
}
