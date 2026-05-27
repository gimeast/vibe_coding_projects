export default function ProgressPanel({ stocks, events, currentStockName, status }) {
  function getProgress(stockName) {
    if (!events.length) return { pct: 0, label: '대기 중' }
    const stockEvents = events.filter(e => e.stockName === stockName)
    if (stockEvents.some(e => e.type === 'stock_done')) return { pct: 100, label: '완료', done: true }
    const sum = stockEvents.find(e => e.type === 'summarizing')
    if (sum) return { pct: 40 + Math.round((sum.current / sum.total) * 50), label: `AI 요약 중 (${sum.current}/${sum.total})` }
    if (stockEvents.some(e => e.type === 'collecting_dart')) return { pct: 30, label: 'DART 수집 중' }
    if (stockEvents.some(e => e.type === 'collecting_news')) return { pct: 10, label: '뉴스 수집 중' }
    if (stockEvents.some(e => e.type === 'stock_start')) return { pct: 5, label: '시작' }
    return { pct: 0, label: '대기 중' }
  }

  if (status === 'idle') return null

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #3c3c3c', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="label-upper">
          {status === 'generating_pdf' ? 'PDF 생성 중...' :
           status === 'done' ? '완료' :
           `리포트 생성 중 — ${currentStockName || ''}`}
        </span>
        {status === 'done' && <span style={{ color: '#0fa336', fontSize: 10, fontWeight: 700 }}>✓ 완료</span>}
      </div>

      {stocks.map(stock => {
        const { pct, label, done } = getProgress(stock.name)
        return (
          <div key={stock.code} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#e6e6e6' }}>{stock.name}</span>
              <span style={{ fontSize: 10, color: done ? '#0fa336' : '#7e7e7e' }}>{label}</span>
            </div>
            <div style={{ height: 2, background: '#1a1a1a', border: '1px solid #3c3c3c' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: done
                  ? '#0fa336'
                  : 'linear-gradient(90deg, #0066b1, #1c69d4)',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        )
      })}

      {status === 'generating_pdf' && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#7e7e7e' }}>
          Puppeteer로 PDF 렌더링 중...
        </div>
      )}
    </div>
  )
}
