import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { Settings } from '../shared/types'

/**
 * userData 에 두는 단일 JSON. Phase 1 규모에서는 SQLite 가 과하다.
 * 히스토리가 들어오는 시점에 다시 판단할 것.
 */
interface PersistedState {
  settings: Settings
  lastUpdateCheck: number | null
}

function defaults(): PersistedState {
  return {
    settings: {
      downloadDir: app.getPath('downloads'),
      filenameTemplate: '%(title)s [%(id)s].%(ext)s',
      updateIntervalDays: 7,
    },
    lastUpdateCheck: null,
  }
}

function statePath(): string {
  return join(app.getPath('userData'), 'state.json')
}

let cache: PersistedState | null = null

export function readState(): PersistedState {
  if (cache) return cache

  const fallback = defaults()
  try {
    const raw = readFileSync(statePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    cache = {
      settings: { ...fallback.settings, ...parsed.settings },
      lastUpdateCheck: parsed.lastUpdateCheck ?? null,
    }
  } catch {
    // 첫 실행이거나 파일이 깨졌다. 어느 쪽이든 기본값으로 시작하면 된다.
    cache = fallback
  }
  return cache
}

export function writeState(patch: Partial<PersistedState>): PersistedState {
  const next = { ...readState(), ...patch }
  cache = next

  const path = statePath()
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function getSettings(): Settings {
  return readState().settings
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  writeState({ settings: next })
  return next
}
