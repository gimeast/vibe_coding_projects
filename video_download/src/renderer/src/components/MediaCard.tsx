import { useState } from 'react'
import { PRESETS, type MediaFormat, type MediaInfo, type Selection } from '@shared/types'
import { formatDuration } from '../lib/format'
import FormatTable from './FormatTable'

interface Props {
  info: MediaInfo
  onDownload: (selection: Selection) => void
}

export default function MediaCard({ info, onDownload }: Props) {
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [format, setFormat] = useState<MediaFormat | null>(null)

  const selection: Selection =
    advancedOpen && format
      ? { kind: 'format', formatId: format.formatId, mergeAudio: !format.hasAudio }
      : { kind: 'preset', presetId }

  const summary =
    advancedOpen && format
      ? `포맷 ${format.formatId} · ${format.resolution || format.ext}`
      : (PRESETS.find((p) => p.id === presetId)?.label ?? '')

  return (
    <section className="card media-card">
      <div className="media-head">
        {info.thumbnail ? (
          <img className="thumb" src={info.thumbnail} alt="" />
        ) : (
          <div className="thumb thumb-empty" />
        )}

        <div className="media-meta">
          <h2 title={info.title}>{info.title}</h2>
          <p className="muted">
            {[
              info.uploader,
              formatDuration(info.duration),
              info.extractor,
              info.via === 'sniffer' ? '페이지 스니핑' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {info.playlistCount !== null ? (
            <p className="warn">
              재생목록 {info.playlistCount}개 중 첫 항목만 받습니다. 일괄 다운로드는
              아직 지원하지 않습니다.
            </p>
          ) : null}
        </div>
      </div>

      <div className="presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={
              !advancedOpen && preset.id === presetId ? 'chip chip-on' : 'chip'
            }
            onClick={() => {
              setPresetId(preset.id)
              setAdvancedOpen(false)
            }}
          >
            <span className="chip-label">{preset.label}</span>
            <span className="chip-desc">{preset.description}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="link-button"
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        {advancedOpen ? '고급 옵션 접기' : `고급 — 전체 포맷 ${info.formats.length}개`}
      </button>

      {advancedOpen ? (
        <FormatTable
          formats={info.formats}
          selectedId={format?.formatId ?? null}
          onSelect={setFormat}
        />
      ) : null}

      <div className="media-actions">
        <span className="muted">{summary}</span>
        <button
          type="button"
          className="primary"
          disabled={advancedOpen && !format}
          onClick={() => onDownload(selection)}
        >
          다운로드
        </button>
      </div>
    </section>
  )
}
