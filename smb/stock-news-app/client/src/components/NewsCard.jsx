export default function NewsCard({ item }) {
  const { title, source, pubDate, url, description, ai } = item
  const impact = ai?.impact || '중립'
  const badgeClass = impact === '상승요인' ? 'badge-up' : impact === '하락요인' ? 'badge-down' : 'badge-neutral'

  return (
    <div className="news-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span className="label-upper">{source}{source && pubDate ? ' · ' : ''}{pubDate}</span>
        <span className={`badge ${badgeClass}`}>{impact}</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: '#e6e6e6', lineHeight: 1.4, marginBottom: 8 }}>
        {title}
      </div>

      {ai?.summary && (
        <div style={{ fontSize: 12, fontWeight: 300, color: '#bbbbbb', lineHeight: 1.6, marginBottom: 8 }}>
          {ai.summary}
        </div>
      )}

      {ai?.keywords?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {ai.keywords.map((kw, i) => (
            <span key={i} style={{
              border: '1px solid #3c3c3c', color: '#7e7e7e',
              fontSize: 9, padding: '2px 6px', fontWeight: 700, letterSpacing: '1px'
            }}>{kw}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#7e7e7e' }}>{pubDate}</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: '#7e7e7e', textDecoration: 'none' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#7e7e7e'}
          >원문 보기 →</a>
        )}
      </div>
    </div>
  )
}
