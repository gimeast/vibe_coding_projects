import type { MediaInfo, Result } from '../../shared/types'
import { humanizeYtdlpError } from './errors'
import { probeWithYtdlp } from './ytdlp'

/**
 * URL → MediaInfo 파이프라인.
 *
 *   1차  yt-dlp 추출기 (지원 사이트 1800+)
 *   2차  숨김 BrowserWindow 로 페이지를 열어 네트워크에서 매니페스트를 낚는다
 *
 * 2차는 Phase 2 과제다. 여기서는 폴백 지점만 만들어 두고, 실패 시 그 사실을
 * 사용자에게 정확히 알린다.
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

  // --- 2차 (Phase 2) ---
  // TODO: sniffer.ts — persist:sniff 파티션의 숨김 창에서 webRequest 를 후킹해
  //       .m3u8 / .mpd / .mp4 후보를 수집하고, referer·쿠키와 함께 다시 1차로 넘긴다.

  return { ok: false, error: humanizeYtdlpError(first.stderr) }
}
