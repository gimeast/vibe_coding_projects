import { useState, useEffect } from 'react'

export default function ReportHistory({ refreshTrigger }) {
  const [files, setFiles] = useState([])

  function load() {
    fetch('/api/report/list').then(r => r.json()).then(setFiles).catch(() => {})
  }

  useEffect(() => { load() }, [refreshTrigger])

  async function handleDelete(filename) {
    if (!confirm(`"${filename}" 리포트를 삭제할까요?`)) return
    const res = await fetch(`/api/report/${filename}`, { method: 'DELETE' })
    if (res.ok) load()
    else alert('삭제 실패')
  }

  if (files.length === 0) return (
    <div style={{ padding: '24px 0', color: '#7e7e7e', fontSize: 16 }}>
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
            padding: '13px 16px', marginBottom: 8
          }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#e6e6e6' }}>{label}</span>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <a
                href={`/api/report/download/${filename}`}
                download
                style={{ fontSize: 15, fontWeight: 700, color: '#7e7e7e', textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = '#7e7e7e'}
              >다운로드 ↓</a>
              <button
                onClick={() => handleDelete(filename)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#3c3c3c', padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#e22718'}
                onMouseLeave={e => e.currentTarget.style.color = '#3c3c3c'}
              >삭제 ×</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
