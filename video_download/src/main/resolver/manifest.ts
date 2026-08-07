import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import type { RequestContext } from '../../shared/types'
import { sniffSession } from './sniffer'

/**
 * 서명된 DASH 매니페스트를 다운로드 가능한 형태로 고쳐 쓴다.
 *
 * CDN 이 `?px-time=…&px-hash=…` 같은 토큰으로 경로 전체를 서명해 두면,
 * 매니페스트 자체는 받아지는데 조각(.m4s)마다 403 이 난다. 브라우저의 dash.js 는
 * 매니페스트의 쿼리스트링을 모든 조각 요청에 그대로 물려 보내지만
 * **yt-dlp 는 그러지 않기 때문이다.** (실측: 쿼리 없이 403, 붙이면 200)
 *
 * 그래서 매니페스트를 받아
 *   1. `initialization` / `media` 템플릿에 쿼리를 덧붙이고
 *   2. 상대 경로가 풀리도록 절대 `<BaseURL>` 을 넣어
 * 임시 파일로 저장한 뒤, 그 file:// 주소를 yt-dlp 에 넘긴다.
 */

/** 이 접두사로 시작하는 주소는 우리가 만든 파일이다. args 쪽에서 판단에 쓴다. */
export const LOCAL_MANIFEST_SCHEME = 'file://'

function manifestDir(): string {
  return join(app.getPath('userData'), 'manifests')
}

/** XML 속성 안에서는 `&` 를 반드시 이스케이프해야 파서가 깨지지 않는다. */
function escapeForXmlAttribute(query: string): string {
  return query.replace(/&/g, '&amp;')
}

function rewriteMpd(xml: string, manifestUrl: string): string | null {
  const parsed = new URL(manifestUrl)
  if (!parsed.search) return null // 서명이 없으면 손댈 이유가 없다

  const query = escapeForXmlAttribute(parsed.search.slice(1))

  // 이미 쿼리가 붙어 있는 항목은 건드리지 않는다
  let replacements = 0
  let out = xml.replace(
    /\b(initialization|media)="([^"]+)"/g,
    (whole, attr: string, value: string) => {
      if (value.includes('?')) return whole
      replacements += 1
      return `${attr}="${value}?${query}"`
    },
  )
  if (replacements === 0) return null

  if (!/<BaseURL>/i.test(out)) {
    const baseDir = new URL('.', parsed).toString().replace(/\?.*$/, '')
    out = out.replace(/(<MPD\b[^>]*>)/, `$1\n  <BaseURL>${baseDir}</BaseURL>`)
  }

  return out
}

/** 스니핑 세션에 쌓인 쿠키를 Cookie 헤더 한 줄로 만든다. */
async function cookieHeader(url: string): Promise<string | null> {
  try {
    const cookies = await sniffSession().cookies.get({ url })
    if (cookies.length === 0) return null
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  } catch {
    return null
  }
}

async function fetchManifest(
  url: string,
  request: RequestContext,
): Promise<string | null> {
  // Electron 세션의 fetch 는 webRequest 계층을 타면서 ERR_BLOCKED_BY_CLIENT 로
  // 떨어지는 경우가 있다. Node 쪽 fetch 로 직접 요청하고 쿠키만 옮겨 붙인다.
  try {
    const cookie = await cookieHeader(url)
    const response = await fetch(url, {
      headers: {
        ...(request.referer ? { Referer: request.referer } : {}),
        ...(request.userAgent ? { 'User-Agent': request.userAgent } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/**
 * 필요하면 고쳐 쓴 매니페스트의 file:// 주소를, 아니면 null 을 돌려준다.
 * 실패는 조용히 null 로 떨어뜨린다 — 호출부가 원래 주소로 계속 진행하면 된다.
 *
 * HLS(.m3u8)는 아직 다루지 않는다. 마스터 → 변형 플레이리스트로 이어지는
 * 다단 구조라 재귀적으로 받아 고쳐야 해서, 실제 사례를 만나기 전에 넣으면
 * 검증되지 않은 코드가 된다.
 */
export async function rewriteSignedManifest(
  manifestUrl: string,
  request: RequestContext,
): Promise<string | null> {
  if (!/\.mpd(\?|$)/i.test(manifestUrl)) return null
  if (!new URL(manifestUrl).search) return null

  const xml = await fetchManifest(manifestUrl, request)
  if (!xml || !/<MPD\b/i.test(xml)) return null

  const rewritten = rewriteMpd(xml, manifestUrl)
  if (!rewritten) return null

  const dir = manifestDir()
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${randomUUID()}.mpd`)
  await writeFile(path, rewritten, 'utf-8')

  return pathToFileURL(path).toString()
}

/** 해석과 다운로드 시점이 떨어져 있어 즉시 못 지운다. 하루 지난 것만 정리. */
export async function pruneManifests(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  const dir = manifestDir()
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }

  const cutoff = Date.now() - maxAgeMs
  await Promise.all(
    entries.map(async (name) => {
      const path = join(dir, name)
      try {
        if ((await stat(path)).mtimeMs < cutoff) await rm(path, { force: true })
      } catch {
        // 지우지 못해도 치명적이지 않다
      }
    }),
  )
}
