export default function DartCard({ item }) {
  const { title, type, submittedAt, url, ai } = item
  const impact = ai?.impact || '중립'
  const importance = ai?.importance || '보통'
  const impactClass = impact === '상승요인' ? 'badge-up' : impact === '하락요인' ? 'badge-down' : 'badge-neutral'
  const importanceClass = importance === '높음' ? 'badge-high' : importance === '낮음' ? 'badge-low' : 'badge-normal'

  return (
    <div className="news-card" style={{ borderLeft: '2px solid #1c69d4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span className="label-upper" style={{ color: '#1c69d4' }}>
          DART · {type}{submittedAt ? ' · ' + submittedAt : ''}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <span className={`badge ${importanceClass}`}>중요도 {importance}</span>
          <span className={`badge ${impactClass}`}>{impact}</span>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: '#e6e6e6', lineHeight: 1.4, marginBottom: 8 }}>
        {title}
      </div>

      {ai?.summary && (
        <div style={{ fontSize: 12, fontWeight: 300, color: '#bbbbbb', lineHeight: 1.6, marginBottom: 8 }}>
          {ai.summary}
        </div>
      )}

      {ai?.reason && (
        <div style={{ fontSize: 11, color: '#7e7e7e', marginBottom: 8 }}>
          📌 {ai.reason}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: '#7e7e7e', textDecoration: 'none' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#7e7e7e'}
          >공시 보기 →</a>
        )}
      </div>
    </div>
  )
}
