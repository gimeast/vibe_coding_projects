import type { JobProgress } from '../../shared/types'
import { FINAL_PREFIX, PROGRESS_PREFIX } from './args'

/** yt-dlp 는 값이 없을 때 "NA" 또는 "None" 을 찍는다. */
function num(token: string | undefined): number | null {
  if (!token) return null
  const t = token.trim()
  if (!t || t === 'NA' || t === 'None') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export type ParsedLine =
  | { kind: 'progress'; progress: JobProgress }
  | { kind: 'final'; path: string }
  | { kind: 'destination'; path: string }
  | { kind: 'postprocess' }
  | { kind: 'other' }

/**
 * yt-dlp 의 출력 한 줄을 해석한다.
 * stdout / stderr 어느 쪽으로 나올지가 버전에 따라 달라서 양쪽 모두 이 함수로 넘긴다.
 */
export function parseLine(line: string): ParsedLine {
  const trimmed = line.trim()

  if (trimmed.startsWith(PROGRESS_PREFIX)) {
    const [downloaded, total, totalEst, speed, eta] = trimmed
      .slice(PROGRESS_PREFIX.length)
      .split('|')

    const downloadedBytes = num(downloaded)
    const totalBytes = num(total) ?? num(totalEst)

    return {
      kind: 'progress',
      progress: {
        downloadedBytes,
        totalBytes,
        ratio:
          downloadedBytes !== null && totalBytes !== null && totalBytes > 0
            ? Math.min(downloadedBytes / totalBytes, 1)
            : null,
        speed: num(speed),
        eta: num(eta),
      },
    }
  }

  if (trimmed.startsWith(FINAL_PREFIX)) {
    return { kind: 'final', path: trimmed.slice(FINAL_PREFIX.length).trim() }
  }

  // 취소 시 지울 대상을 알기 위해 목적지를 기억해 둔다
  const dest = trimmed.match(/^\[download\]\s+Destination:\s+(.+)$/)
  if (dest) return { kind: 'destination', path: dest[1].trim() }

  const merger = trimmed.match(/^\[Merger\]\s+Merging formats into\s+"(.+)"$/)
  if (merger) return { kind: 'postprocess' }

  if (/^\[(ExtractAudio|VideoConvertor|Fixup\w*)\]/.test(trimmed)) {
    return { kind: 'postprocess' }
  }

  return { kind: 'other' }
}
