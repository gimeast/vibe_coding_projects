import type { MediaFormat } from '@shared/types'
import { formatBytes } from '../lib/format'

interface Props {
  formats: MediaFormat[]
  selectedId: string | null
  onSelect: (format: MediaFormat) => void
}

function kindLabel(format: MediaFormat): string {
  if (format.hasVideo && format.hasAudio) return '영상+음성'
  if (format.hasVideo) return '영상만'
  return '음성만'
}

function codecLabel(codec: string | null): string {
  if (!codec) return '—'
  // "avc1.640028" 처럼 뒤에 프로파일이 붙는다. 목록에서는 앞부분만으로 충분하다.
  return codec.split('.')[0]
}

export default function FormatTable({ formats, selectedId, onSelect }: Props) {
  if (formats.length === 0) {
    return <p className="muted">선택할 수 있는 포맷 정보가 없습니다.</p>
  }

  return (
    <div className="format-table-wrap">
      <table className="format-table">
        <thead>
          <tr>
            <th>해상도</th>
            <th>종류</th>
            <th>확장자</th>
            <th>fps</th>
            <th>영상 코덱</th>
            <th>음성 코덱</th>
            <th className="right">용량</th>
          </tr>
        </thead>
        <tbody>
          {formats.map((format) => (
            <tr
              key={format.formatId}
              className={format.formatId === selectedId ? 'selected' : undefined}
              onClick={() => onSelect(format)}
            >
              <td>
                <span className="mono">{format.resolution || '—'}</span>
                {format.note ? <span className="note">{format.note}</span> : null}
              </td>
              <td>{kindLabel(format)}</td>
              <td className="mono">{format.ext || '—'}</td>
              <td className="mono">{format.fps ?? '—'}</td>
              <td className="mono">{codecLabel(format.vcodec)}</td>
              <td className="mono">{codecLabel(format.acodec)}</td>
              <td className="right mono">
                {formatBytes(format.filesize)}
                {format.filesizeIsEstimate && format.filesize !== null ? '≈' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
