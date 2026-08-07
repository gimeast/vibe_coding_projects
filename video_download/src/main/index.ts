import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { maybeAutoUpdate } from './binaries'
import { queue } from './download/queue'
import { broadcastJobUpdates, registerIpc } from './ipc'
import { pruneCookieFiles } from './resolver/cookies'
import { pruneManifests } from './resolver/manifest'
import { getSettings } from './state'

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#14161a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  // 외부 링크는 앱 창이 아니라 기본 브라우저로
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  registerIpc()
  broadcastJobUpdates()
  createWindow()

  // 사이트가 자주 깨지므로 주기적으로 yt-dlp 를 갱신한다. 실패해도 앱은 계속 뜬다.
  void maybeAutoUpdate(getSettings().updateIntervalDays).catch(() => {})
  void pruneCookieFiles().catch(() => {})
  void pruneManifests().catch(() => {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 남은 yt-dlp/ffmpeg 프로세스가 고아로 떠도는 것을 막는다
app.on('before-quit', () => queue.cancelAll())
