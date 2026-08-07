import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { sniffSession } from './sniffer'

/**
 * 스니핑 세션의 쿠키를 yt-dlp 가 읽을 수 있는 Netscape 형식으로 내보낸다.
 *
 * 로그인이 필요한 페이지는 매니페스트 주소를 찾아도 쿠키 없이는 403 이 난다.
 * 로그인 창과 스니핑 창이 같은 파티션을 쓰는 설계가 여기서 값을 한다.
 */

function cookieDir(): string {
  return join(app.getPath('userData'), 'cookies')
}

function line(parts: (string | number)[]): string {
  // 탭 구분. 값에 탭이 들어 있으면 파일이 깨지므로 제거한다.
  return parts.map((p) => String(p).replace(/\t/g, ' ')).join('\t')
}

/**
 * 쿠키가 하나도 없으면 null 을 돌려준다 — 빈 파일을 넘기면 yt-dlp 가
 * 경고를 뱉을 뿐 얻는 게 없다.
 */
export async function exportCookies(): Promise<string | null> {
  const cookies = await sniffSession().cookies.get({})
  if (cookies.length === 0) return null

  const rows = cookies.map((c) => {
    const includeSubdomains = c.domain?.startsWith('.') ? 'TRUE' : 'FALSE'
    // 세션 쿠키는 만료 0 으로 표기하는 게 관례다
    const expires = c.session || !c.expirationDate ? 0 : Math.floor(c.expirationDate)
    return line([
      c.domain ?? '',
      includeSubdomains,
      c.path || '/',
      c.secure ? 'TRUE' : 'FALSE',
      expires,
      c.name,
      c.value,
    ])
  })

  const body = ['# Netscape HTTP Cookie File', '# 자동 생성됨 — 직접 편집하지 말 것', ...rows, ''].join(
    '\n',
  )

  const dir = cookieDir()
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${randomUUID()}.txt`)
  await writeFile(path, body, 'utf-8')
  return path
}

/**
 * 오래된 쿠키 파일을 치운다. 해석 시점과 다운로드 시점이 떨어져 있어서
 * 곧바로 지울 수 없으므로, 앱 시작 시 하루 지난 것만 정리한다.
 */
export async function pruneCookieFiles(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  const dir = cookieDir()
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return // 아직 만들어진 적이 없다
  }

  const cutoff = Date.now() - maxAgeMs
  await Promise.all(
    entries.map(async (name) => {
      const path = join(dir, name)
      try {
        const { statSync } = await import('node:fs')
        if (statSync(path).mtimeMs < cutoff) await rm(path, { force: true })
      } catch {
        // 지우지 못해도 치명적이지 않다
      }
    }),
  )
}
