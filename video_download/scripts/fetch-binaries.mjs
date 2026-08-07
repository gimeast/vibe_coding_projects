#!/usr/bin/env node
/**
 * 동봉용 yt-dlp 바이너리를 resources/bin/<platform>-<arch>/ 로 내려받는다.
 *
 *   node scripts/fetch-binaries.mjs            # 현재 플랫폼
 *   node scripts/fetch-binaries.mjs --all      # mac + win 모두 (배포 빌드용)
 *
 * ffmpeg 는 공식 단일 바이너리 배포처가 플랫폼마다 제각각이라 자동화하지 않는다.
 * 없으면 앱이 시스템 PATH 의 ffmpeg 로 폴백하므로 개발 중에는 문제되지 않는다.
 */

import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

/** platform-arch 디렉터리 → [원격 파일명, 저장할 이름] */
const TARGETS = {
  'darwin-arm64': ['yt-dlp_macos', 'yt-dlp'],
  'darwin-x64': ['yt-dlp_macos', 'yt-dlp'],
  'win32-x64': ['yt-dlp.exe', 'yt-dlp.exe'],
}

async function fetchOne(key) {
  const target = TARGETS[key]
  if (!target) {
    console.error(`지원하지 않는 플랫폼: ${key}`)
    process.exitCode = 1
    return
  }

  const [remote, local] = target
  const url = `${BASE}/${remote}`
  const dir = join(ROOT, 'resources', 'bin', key)
  const dest = join(dir, local)

  process.stdout.write(`${key}: ${url} … `)

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    console.log(`실패 (HTTP ${response.status})`)
    process.exitCode = 1
    return
  }

  await mkdir(dir, { recursive: true })
  await writeFile(dest, Buffer.from(await response.arrayBuffer()))

  // electron-builder 가 실행 비트를 잃는 경우가 있어 여기서 명시적으로 세운다
  if (!local.endsWith('.exe')) await chmod(dest, 0o755)

  console.log(`완료 → resources/bin/${key}/${local}`)
}

const keys = process.argv.includes('--all')
  ? Object.keys(TARGETS)
  : [`${process.platform}-${process.arch}`]

for (const key of keys) await fetchOne(key)
