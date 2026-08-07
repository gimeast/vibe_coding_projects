import type { MediaInfo, RequestContext, Result } from '../../shared/types'
import { exportCookies } from './cookies'
import { humanizeYtdlpError } from './errors'
import { rewriteSignedManifest } from './manifest'
import { type SniffCandidate, sniff } from './sniffer'
import { probeWithYtdlp } from './ytdlp'

export { openLoginWindow } from './sniffer'

/**
 * URL → MediaInfo 파이프라인.
 *
 *   1차  yt-dlp 추출기 (지원 사이트 1800+)
 *   2차  숨김 BrowserWindow 로 페이지를 열어 네트워크에서 매니페스트를 낚고,
 *        그 주소를 다시 1차로 넘긴다
 */
export async function resolve(url: string): Promise<Result<MediaInfo>> {
  const trimmed = url.trim()
  if (!trimmed) return { ok: false, error: 'URL 을 입력해 주세요.' }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, error: '올바른 URL 이 아닙니다.' }
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: 'http 또는 https 주소만 지원합니다.' }
  }

  // --- 1차 ---
  const first = await probeWithYtdlp(trimmed)
  if (first.info) return { ok: true, value: first.info }

  // --- 2차 ---
  return sniffAndProbe(trimmed, first.stderr)
}

async function sniffAndProbe(
  pageUrl: string,
  firstPassStderr: string,
): Promise<Result<MediaInfo>> {
  let result
  try {
    result = await sniff(pageUrl)
  } catch (err) {
    // 스니퍼가 터졌으면 1차 실패 사유를 그대로 보여주는 편이 사용자에게 유용하다
    console.error('sniff failed:', err)
    return { ok: false, error: humanizeYtdlpError(firstPassStderr) }
  }

  if (result.candidates.length === 0) {
    return {
      ok: false,
      error:
        '이 페이지에서 동영상을 찾지 못했습니다. 로그인이 필요한 페이지라면 로그인 후 다시 시도해 주세요.',
    }
  }

  const request: RequestContext = {
    referer: result.referer,
    userAgent: result.userAgent,
    cookieFile: await exportCookies(),
  }

  // 매니페스트가 앞에 오도록 정렬돼 있다. 되는 게 나올 때까지 위에서부터.
  const attempted: string[] = []
  for (const candidate of pickAttempts(result.candidates)) {
    // 서명된 DASH 는 조각마다 토큰이 필요해서 매니페스트를 고쳐 써야 받아진다.
    // 해석 단계에서 미리 만들어 두면 다운로드도 같은 주소를 쓰게 된다.
    const rewritten = await rewriteSignedManifest(candidate.url, request).catch(
      () => null,
    )

    const probe = await probeWithYtdlp(rewritten ?? candidate.url, {
      via: 'sniffer',
      request,
      displayUrl: pageUrl,
    })

    if (probe.info) {
      return { ok: true, value: withPageMeta(probe.info, result) }
    }
    attempted.push(probe.stderr)
  }

  return {
    ok: false,
    error: attempted.length
      ? humanizeYtdlpError(attempted[0])
      : '찾아낸 주소로 영상을 받을 수 없었습니다.',
  }
}

/**
 * 후보를 전부 시도하면 느려진다. 매니페스트는 넉넉히, progressive 는 맛보기만.
 * 광고 영상이 progressive 로 여러 개 섞여 들어오는 경우가 흔하다.
 */
function pickAttempts(candidates: SniffCandidate[]): SniffCandidate[] {
  const manifests = candidates.filter((c) => c.kind === 'manifest').slice(0, 3)
  const progressive = candidates.filter((c) => c.kind === 'progressive').slice(0, 2)
  return [...manifests, ...progressive]
}

/**
 * 매니페스트에서 뽑은 메타데이터는 쓸모가 없다 — 제목이 `adaptive` 같은 파일명이 된다.
 * 페이지에서 긁어온 og:title / og:image 로 덮는다.
 */
function withPageMeta(
  info: MediaInfo,
  sniffed: { pageTitle: string | null; pageThumbnail: string | null },
): MediaInfo {
  return {
    ...info,
    title: sniffed.pageTitle ?? info.title,
    thumbnail: sniffed.pageThumbnail ?? info.thumbnail,
  }
}
