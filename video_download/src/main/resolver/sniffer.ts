import { BrowserWindow, session } from 'electron'
import type { Session, WebFrameMain } from 'electron'

/**
 * 2차 경로 — 페이지를 실제로 렌더링해서 네트워크에 흐르는 미디어 주소를 낚는다.
 *
 * 요즘 플레이어는 hls.js / dash.js + MSE 를 쓰기 때문에 `video.src` 가 `blob:` 이고,
 * 정적 HTML 에도 DOM 에도 실주소가 없다. 유일하게 확실한 지점이 네트워크 계층이라
 * 여기서 가로챈다. (근거는 DESIGN.md §3.1 의 v.daum.net 사례 참고)
 */

/** 로그인 세션을 재사용하려면 파티션이 디스크에 유지돼야 한다. 로그인 창과 공유한다. */
export const SNIFF_PARTITION = 'persist:sniff'

export interface SniffCandidate {
  url: string
  kind: 'manifest' | 'progressive'
}

export interface SniffResult {
  candidates: SniffCandidate[]
  /** 사이트가 referer 를 검사하는 경우가 있어 원본 페이지 주소를 함께 넘긴다 */
  referer: string
  userAgent: string
  /**
   * 페이지에서 긁어온 표시용 메타데이터.
   * 매니페스트만 보고 판단하면 제목이 `adaptive` 같은 파일명으로 잡혀 쓸모가 없다.
   */
  pageTitle: string | null
  pageThumbnail: string | null
}

// ------------------------------------------------------------------ URL 분류

const MANIFEST_RE = /\.(m3u8|mpd)(\?|$)/i
const PROGRESSIVE_RE = /\.(mp4|webm|m4v|mov|flv)(\?|$)/i

/**
 * 세그먼트 소음. DASH/HLS 는 조각을 수백 개씩 쏟아내므로 걸러내지 않으면
 * 후보 목록이 쓰레기로 가득 찬다. init 세그먼트가 `init.mp4` 로 오는 경우가 있어
 * progressive 판정보다 먼저 검사해야 한다.
 */
const SEGMENT_RE = [
  /\.(m4s|ts|aac)(\?|$)/i,
  /(^|\/)(init|seg|segment|chunk|frag)[^/]*\.(mp4|m4s|webm)(\?|$)/i,
  /\/\d{3,}\.(mp4|m4s|ts|webm)(\?|$)/i,
]

function classify(url: string): SniffCandidate['kind'] | null {
  if (!/^https?:/i.test(url)) return null
  if (SEGMENT_RE.some((re) => re.test(url))) return null
  if (MANIFEST_RE.test(url)) return 'manifest'
  if (PROGRESSIVE_RE.test(url)) return 'progressive'
  return null
}

/** 매니페스트를 progressive 보다 앞에 두되, 같은 종류끼리는 발견 순서를 지킨다. */
function rank(candidates: SniffCandidate[]): SniffCandidate[] {
  return [
    ...candidates.filter((c) => c.kind === 'manifest'),
    ...candidates.filter((c) => c.kind === 'progressive'),
  ]
}

// ------------------------------------------------------------------ 재생 유도

/**
 * 로드만으로는 아무것도 안 잡히는 경우가 많다 — 플레이어가 재생 시점에야
 * 매니페스트를 요청하기 때문이다. 자동재생 차단을 피하려고 음소거 후 play() 한다.
 */
const PLAY_TRIGGER = `
(() => {
  let touched = 0;
  for (const v of document.querySelectorAll('video')) {
    try { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); touched++; } catch {}
  }
  const selectors = [
    '.vjs-big-play-button',
    'button[class*="play" i]',
    '[class*="btn_play" i]',
    '[aria-label*="play" i]',
    '[aria-label*="재생"]',
  ];
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) { try { el.click(); touched++; } catch {} break; }
  }
  return touched;
})()
`

function allFrames(window: BrowserWindow): WebFrameMain[] {
  try {
    return window.webContents.mainFrame.framesInSubtree
  } catch {
    return []
  }
}

const META_SCRIPT = `
(() => {
  const pick = (sel, attr) => {
    const el = document.querySelector(sel);
    const v = el && (attr ? el.getAttribute(attr) : el.textContent);
    return v && v.trim() ? v.trim() : null;
  };
  return {
    title:
      pick('meta[property="og:title"]', 'content') ||
      pick('meta[name="twitter:title"]', 'content') ||
      (document.title && document.title.trim()) || null,
    thumbnail:
      pick('meta[property="og:image"]', 'content') ||
      pick('meta[name="twitter:image"]', 'content') || null,
  };
})()
`

async function extractMeta(
  window: BrowserWindow,
): Promise<{ title: string | null; thumbnail: string | null }> {
  if (window.isDestroyed()) return { title: null, thumbnail: null }
  try {
    return (await window.webContents.executeJavaScript(META_SCRIPT, true)) as {
      title: string | null
      thumbnail: string | null
    }
  } catch {
    return { title: null, thumbnail: null }
  }
}

async function triggerPlay(window: BrowserWindow): Promise<void> {
  // 플레이어가 iframe 안에 있는 경우가 흔해서 모든 프레임에 시도한다
  await Promise.all(
    allFrames(window).map(async (frame) => {
      try {
        await frame.executeJavaScript(PLAY_TRIGGER, true)
      } catch {
        // 프레임이 이미 사라졌거나 실행이 거부됐다. 다른 프레임은 계속 시도한다.
      }
    }),
  )
}

// -------------------------------------------------------------------- 본체

const LOAD_TIMEOUT_MS = 20_000
/** 첫 매니페스트를 잡은 뒤, 더 나은 후보가 뒤따라올 시간을 조금 준다 */
const GRACE_AFTER_HIT_MS = 1_200
const POLL_MS = 200

/**
 * webRequest 리스너는 세션당 하나뿐이라 동시에 두 건을 스니핑하면 서로 덮어쓴다.
 * 굳이 webContentsId 로 분기하느니 직렬화하는 편이 단순하고 안전하다.
 */
let chain: Promise<unknown> = Promise.resolve()

export function sniff(pageUrl: string): Promise<SniffResult> {
  const run = (): Promise<SniffResult> => doSniff(pageUrl)
  const result = chain.then(run, run)
  chain = result.catch(() => undefined)
  return result
}

async function doSniff(pageUrl: string): Promise<SniffResult> {
  const ses = session.fromPartition(SNIFF_PARTITION)
  const found = new Map<string, SniffCandidate>()

  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const kind = classify(details.url)
    if (kind && !found.has(details.url)) found.set(details.url, { url: details.url, kind })
    callback({})
  })

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: SNIFF_PARTITION,
      // 페이지 스크립트가 우리 preload 나 Node 에 닿을 이유가 전혀 없다
      preload: undefined,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  const userAgent = stripElectronFromUserAgent(window.webContents.getUserAgent())
  window.webContents.setUserAgent(userAgent)

  let meta: { title: string | null; thumbnail: string | null } = {
    title: null,
    thumbnail: null,
  }

  try {
    await loadAndWatch(window, pageUrl, found)
    meta = await extractMeta(window)
  } finally {
    ses.webRequest.onBeforeRequest(null)
    if (!window.isDestroyed()) window.destroy()
  }

  return {
    candidates: rank([...found.values()]),
    referer: pageUrl,
    userAgent,
    pageTitle: meta.title,
    pageThumbnail: meta.thumbnail,
  }
}

async function loadAndWatch(
  window: BrowserWindow,
  pageUrl: string,
  found: Map<string, SniffCandidate>,
): Promise<void> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS

  try {
    await window.loadURL(pageUrl)
  } catch {
    // 리다이렉트나 취소로 loadURL 이 reject 되어도 이미 오간 요청은 잡혔을 수 있다
  }

  let played = false
  let firstHitAt: number | null = null

  while (Date.now() < deadline) {
    if (window.isDestroyed()) return

    const hasManifest = [...found.values()].some((c) => c.kind === 'manifest')
    if (hasManifest) {
      firstHitAt ??= Date.now()
      if (Date.now() - firstHitAt >= GRACE_AFTER_HIT_MS) return
    }

    // 로드 직후 한 번 재생을 유도한다. 프레임이 늦게 붙는 경우가 있어 조금 기다렸다가.
    if (!played && Date.now() > deadline - LOAD_TIMEOUT_MS + 1_200) {
      played = true
      await triggerPlay(window)
    }

    await delay(POLL_MS)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 기본 UA 에는 `Electron/x.y.z` 와 앱 이름이 박혀 있다. 이걸 그대로 보내면
 * 일부 사이트가 미지원 브라우저로 취급해 플레이어를 아예 띄우지 않는다.
 */
function stripElectronFromUserAgent(ua: string): string {
  return ua
    .replace(/\s*Electron\/[\d.]+/i, '')
    .replace(/\s*video-download\/[\d.]+/i, '')
    .trim()
}

/**
 * 로그인 창. 스니핑용 숨김 창과 같은 파티션을 쓰므로, 여기서 로그인하면
 * 그 쿠키가 그대로 스니핑에 재사용된다. 시스템 브라우저에서 쿠키를 훔쳐오는
 * `--cookies-from-browser` 방식보다 깔끔하고 덜 침습적이다.
 */
export function openLoginWindow(pageUrl: string): void {
  const window = new BrowserWindow({
    width: 1024,
    height: 768,
    title: '로그인',
    webPreferences: {
      partition: SNIFF_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  window.webContents.setUserAgent(
    stripElectronFromUserAgent(window.webContents.getUserAgent()),
  )
  void window.loadURL(pageUrl)
}

export function sniffSession(): Session {
  return session.fromPartition(SNIFF_PARTITION)
}
