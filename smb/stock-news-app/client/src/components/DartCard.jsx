import { useState } from 'react'

export default function DartCard({ item }) {
  const { title, type, submittedAt, url, rcpNo } = item
  const [downloading, setDownloading] = useState(false)

  return (
    <div className="news-card" style={{ borderLeft: '2px solid #1c69d4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span className="label-upper" style={{ color: '#1c69d4' }}>
          DART · {type}{submittedAt ? ' · ' + submittedAt : ''}
        </span>
      </div>

      {url
        ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#e6e6e6', lineHeight: 1.45, marginBottom: 8, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#e6e6e6'}
            >{title}</div>
          </a>
        : <div style={{ fontSize: 17, fontWeight: 700, color: '#e6e6e6', lineHeight: 1.45, marginBottom: 8 }}>{title}</div>
      }

      {rcpNo && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={async () => {
              setDownloading(true)
              try {
                const res = await fetch(`/api/dart/pdf/${rcpNo}`)
                if (!res.ok) { const err = await res.json(); alert(err.error || '다운로드 실패'); return }
                const blob = await res.blob()
                const ext = res.headers.get('content-type')?.includes('pdf') ? 'pdf' : 'hwp'
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `dart_${rcpNo}.${ext}`
                a.click()
                URL.revokeObjectURL(a.href)
              } catch { alert('다운로드 중 오류가 발생했습니다') }
              finally { setDownloading(false) }
            }}
            disabled={downloading}
            style={{
              background: 'none', border: 'none', cursor: downloading ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700, letterSpacing: '1px',
              color: downloading ? '#3c3c3c' : '#1c69d4', padding: 0,
            }}
            onMouseEnter={e => { if (!downloading) e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { if (!downloading) e.currentTarget.style.color = '#1c69d4' }}
          >
            {downloading ? '다운로드 중...' : 'PDF ↓'}
          </button>
        </div>
      )}
    </div>
  )
}
