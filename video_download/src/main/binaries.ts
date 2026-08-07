import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { BinaryInfo, BinaryStatus } from '../shared/types'
import { readState, writeState } from './state'

const execFileAsync = promisify(execFile)

const IS_WINDOWS = process.platform === 'win32'
const EXE = IS_WINDOWS ? '.exe' : ''

/**
 * PATH 가 비어 있다시피 한 환경에서도 찾을 수 있도록 하는 보조 경로.
 * macOS 는 Finder 에서 띄운 앱이 로그인 셸의 PATH 를 물려받지 않아서,
 * Homebrew 로 깐 yt-dlp 가 PATH 에 없는 게 정상이다.
 */
const EXTRA_LOOKUP_DIRS = IS_WINDOWS
  ? []
  : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/opt/local/bin']

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * 동봉 바이너리가 놓일 수 있는 디렉터리들.
 *
 * packaged 는 resourcesPath 하나로 확정되지만, dev 는 앱을 어떻게 띄우느냐에 따라
 * `app.getAppPath()` 가 프로젝트 루트일 수도 있고 (`electron .`)
 * 진입 파일의 디렉터리일 수도 있다 (`electron out/main/foo.js`).
 * 후자에서 조용히 시스템 바이너리로 폴백해 버리면 원인을 찾기 어려운 실패가 된다.
 */
function bundledDirs(): string[] {
  const platformDir = `${process.platform}-${process.arch}`
  const suffix = ['resources', 'bin', platformDir]

  if (app.isPackaged) return [join(process.resourcesPath, 'bin', platformDir)]

  return [
    join(app.getAppPath(), ...suffix),
    // out/main → 프로젝트 루트
    join(__dirname, '..', '..', ...suffix),
    join(process.cwd(), ...suffix),
  ]
}

function findOnPath(name: string): string | null {
  const fromEnv = (process.env.PATH ?? '').split(IS_WINDOWS ? ';' : ':')
  for (const dir of [...fromEnv, ...EXTRA_LOOKUP_DIRS]) {
    if (!dir) continue
    const candidate = join(dir, name + EXE)
    if (isExecutable(candidate)) return candidate
  }
  return null
}

/** 동봉본 우선, 없으면 시스템 설치본으로 폴백. */
function locate(name: string): Pick<BinaryInfo, 'path' | 'source'> {
  for (const dir of bundledDirs()) {
    const bundled = join(dir, name + EXE)
    if (isExecutable(bundled)) return { path: bundled, source: 'bundled' }
  }

  const system = findOnPath(name)
  if (system) return { path: system, source: 'system' }

  return { path: '', source: 'missing' }
}

/**
 * 동봉하는 yt-dlp 는 PyInstaller 번들이라 실행할 때마다 자기 자신을 풀어낸다.
 * `--version` 한 줄 찍는 데도 실측 9초쯤 걸려서, 타임아웃을 짧게 잡으면
 * 바이너리가 멀쩡한데도 "없음" 으로 표시된다.
 */
const VERSION_PROBE_TIMEOUT_MS = 30_000

async function probeVersion(
  path: string,
  args: string[],
  parse: (stdout: string) => string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(path, args, {
      timeout: VERSION_PROBE_TIMEOUT_MS,
    })
    return parse(stdout).trim() || null
  } catch {
    return null
  }
}

let cached: BinaryStatus | null = null

export async function getBinaryStatus(refresh = false): Promise<BinaryStatus> {
  if (cached && !refresh) return cached

  const ytdlpLoc = locate('yt-dlp')
  const ffmpegLoc = locate('ffmpeg')

  const [ytdlpVersion, ffmpegVersion] = await Promise.all([
    ytdlpLoc.path
      ? probeVersion(ytdlpLoc.path, ['--version'], (s) => s)
      : Promise.resolve(null),
    ffmpegLoc.path
      ? probeVersion(ffmpegLoc.path, ['-version'], (s) => {
          // "ffmpeg version 7.1 Copyright ..." 에서 버전만
          const m = s.match(/ffmpeg version (\S+)/)
          return m ? m[1] : ''
        })
      : Promise.resolve(null),
  ])

  cached = {
    ytdlp: { ...ytdlpLoc, version: ytdlpVersion },
    ffmpeg: { ...ffmpegLoc, version: ffmpegVersion },
    lastUpdateCheck: readState().lastUpdateCheck,
  }
  return cached
}

/** 다운로드 실행 직전에 쓰는 경로. 없으면 던진다. */
export async function requireYtdlp(): Promise<string> {
  const { ytdlp } = await getBinaryStatus()
  if (ytdlp.source === 'missing') {
    throw new Error(
      'yt-dlp 를 찾지 못했습니다. resources/bin 에 동봉하거나 시스템에 설치해 주세요.',
    )
  }
  return ytdlp.path
}

export async function getFfmpegPath(): Promise<string | null> {
  const { ffmpeg } = await getBinaryStatus()
  return ffmpeg.source === 'missing' ? null : ffmpeg.path
}

/**
 * yt-dlp 자가 업데이트.
 *
 * 사이트가 수시로 추출기를 깨뜨려서 yt-dlp 는 거의 주 단위로 릴리스된다.
 * 몇 달 방치하면 주요 플랫폼조차 실패하므로 주기적 갱신이 사실상 필수다.
 *
 * 시스템 설치본(Homebrew 등)은 패키지 매니저가 관리하므로 건드리지 않는다.
 */
export async function updateYtdlp(): Promise<{ updated: boolean; message: string }> {
  const status = await getBinaryStatus(true)

  if (status.ytdlp.source === 'missing') {
    return { updated: false, message: 'yt-dlp 가 설치되어 있지 않습니다.' }
  }
  if (status.ytdlp.source === 'system') {
    writeState({ lastUpdateCheck: Date.now() })
    return {
      updated: false,
      message:
        '시스템에 설치된 yt-dlp 라 자동 갱신을 건너뜁니다. `brew upgrade yt-dlp` 로 직접 올려주세요.',
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(status.ytdlp.path, ['-U'], {
      timeout: 120_000,
    })
    writeState({ lastUpdateCheck: Date.now() })
    cached = null
    const out = (stdout + stderr).trim()
    return { updated: !/is up to date/i.test(out), message: out || '갱신 완료' }
  } catch (err) {
    return {
      updated: false,
      message: `갱신 실패: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** 앱 시작 시 호출. 마지막 갱신으로부터 interval 일이 지났으면 백그라운드로 업데이트. */
export async function maybeAutoUpdate(intervalDays: number): Promise<void> {
  if (intervalDays <= 0) return

  const last = readState().lastUpdateCheck
  const elapsed = last === null ? Infinity : Date.now() - last
  if (elapsed < intervalDays * 24 * 60 * 60 * 1000) return

  await updateYtdlp()
}
