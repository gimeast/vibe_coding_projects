import { useState, useEffect } from 'react'

export default function ReportHistory({ refreshTrigger }) {
  const [files, setFiles] = useState([])

  useEffect(() => {
    fetch('/api/report/list').then(r => r.json()).then(setFiles).catch(() => {})
  }, [refreshTrigger])

  if (files.length === 0) return (
    <div style={{ padding: '20px 0', color: '#7e7e7e', fontSize: 12 }}>
      생성된 리포트가 없습니다
    </div>
  )

  return (
    <div>
      {files.map(filename => {
        const parts = filename.replace('stock_report_', '').replace('.pdf', '')
        const y = parts.slice(0, 4), mo = parts.slice(4, 6), d = parts.slice(6, 8)
        const h = parts.slice(8, 10), mi = parts.slice(10, 12)
        const label = `${y}-${mo}-${d} ${h}:${mi}`
        return (
          <div key={filename} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#1a1a1a', border: '1px solid #3c3c3c',
            padding: '10px 14px', marginBottom: 6
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e6e6e6' }}>{label}</span>
            <a
              href={`/api/report/download/${filename}`}
              download
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
                color: '#7e7e7e', textDecoration: 'none'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#7e7e7e'}
            >다운로드 →</a>
          </div>
        )
      })}
    </div>
  )
}
