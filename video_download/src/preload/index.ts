import { contextBridge, ipcRenderer } from 'electron'
import type {
  BinaryStatus,
  Job,
  MediaInfo,
  Result,
  Selection,
  Settings,
} from '../shared/types'

const JOB_UPDATE_CHANNEL = 'job:update'

/**
 * 렌더러에 노출하는 유일한 표면. ipcRenderer 자체는 절대 넘기지 않는다 —
 * 넘기는 순간 렌더러가 임의 채널을 호출할 수 있게 되어 contextIsolation 이 무의미해진다.
 */
const api = {
  resolve: (url: string): Promise<Result<MediaInfo>> =>
    ipcRenderer.invoke('resolve', url),

  /** 스니핑 세션과 같은 파티션의 창을 띄워 사용자가 직접 로그인하게 한다 */
  openLogin: (url: string): Promise<void> => ipcRenderer.invoke('resolve:login', url),

  download: {
    start: (info: MediaInfo, selection: Selection): Promise<Job> =>
      ipcRenderer.invoke('download:start', { info, selection }),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke('download:cancel', id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('download:remove', id),
    list: (): Promise<Job[]> => ipcRenderer.invoke('download:list'),

    /** 구독 해제 함수를 돌려준다. useEffect 정리에 그대로 쓸 것. */
    onUpdate: (handler: (job: Job) => void): (() => void) => {
      const listener = (_e: unknown, job: Job): void => handler(job)
      ipcRenderer.on(JOB_UPDATE_CHANNEL, listener)
      return () => {
        ipcRenderer.removeListener(JOB_UPDATE_CHANNEL, listener)
      }
    },
  },

  binaries: {
    status: (refresh?: boolean): Promise<BinaryStatus> =>
      ipcRenderer.invoke('binaries:status', refresh),
    update: (): Promise<{ updated: boolean; message: string }> =>
      ipcRenderer.invoke('binaries:update'),
  },

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke('settings:update', patch),
    chooseDir: (): Promise<string | null> => ipcRenderer.invoke('settings:chooseDir'),
  },

  shell: {
    reveal: (path: string): Promise<void> => ipcRenderer.invoke('shell:reveal', path),
    open: (path: string): Promise<void> => ipcRenderer.invoke('shell:open', path),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('shell:openExternal', url),
  },
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
