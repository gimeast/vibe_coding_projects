import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { getBinaryStatus, updateYtdlp } from './binaries'
import { queue } from './download/queue'
import { resolve as resolveUrl } from './resolver'
import { getSettings, updateSettings } from './state'
import type { MediaInfo, Selection, Settings } from '../shared/types'

export const JOB_UPDATE_CHANNEL = 'job:update'

export function registerIpc(): void {
  ipcMain.handle('resolve', (_e, url: string) => resolveUrl(url))

  ipcMain.handle(
    'download:start',
    (_e, payload: { info: MediaInfo; selection: Selection }) =>
      queue.enqueue(payload.info, payload.selection),
  )
  ipcMain.handle('download:cancel', (_e, id: string) => queue.cancel(id))
  ipcMain.handle('download:remove', (_e, id: string) => queue.remove(id))
  ipcMain.handle('download:list', () => queue.list())

  ipcMain.handle('binaries:status', (_e, refresh?: boolean) => getBinaryStatus(refresh))
  ipcMain.handle('binaries:update', () => updateYtdlp())

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) =>
    updateSettings(patch),
  )

  ipcMain.handle('settings:chooseDir', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      properties: ['openDirectory' as const, 'createDirectory' as const],
      defaultPath: getSettings().downloadDir,
    }

    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null
    return updateSettings({ downloadDir: result.filePaths[0] }).downloadDir
  })

  ipcMain.handle('shell:reveal', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('shell:open', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    // 렌더러가 임의 스킴을 열지 못하도록 막는다
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return undefined
  })
}

/** 작업 상태 변화를 열려 있는 모든 창에 흘려보낸다. */
export function broadcastJobUpdates(): () => void {
  return queue.onChange((job) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(JOB_UPDATE_CHANNEL, job)
    }
  })
}
