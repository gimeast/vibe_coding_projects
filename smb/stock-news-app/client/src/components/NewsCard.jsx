export default function NewsCard({ item }) {
  const { title, source, pubDate, url, description } = item

  return (
    <div className="news-card">
      <div style={{ marginBottom: 8 }}>
        <span className="label-upper">{source}{source && pubDate ? ' · ' : ''}{pubDate}</span>
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

      {description && (
        <div style={{ fontSize: 15, fontWeight: 400, color: '#bbbbbb', lineHeight: 1.7, marginBottom: 8 }}>
          {description}
        </div>
      )}
    </div>
  )
}
