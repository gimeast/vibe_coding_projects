import { useState, useEffect, useRef } from 'react'
import StockSidebar from './components/StockSidebar.jsx'
import NewsCard from './components/NewsCard.jsx'
import DartCard from './components/DartCard.jsx'
import ProgressPanel from './components/ProgressPanel.jsx'
import ModeToggle from './components/ModeToggle.jsx'
import ReportHistory from './components/ReportHistory.jsx'

export default function App() {
  const [stocks, setStocks] = useState([])
  const [selectedStock, setSelectedStock] = useState(null)
  const [activeTab, setActiveTab] = useState('news')   // 'news' | 'dart' | 'summary'
  const [activeView, setActiveView] = useState('stock') // 'stock' | 'history'
  const [news, setNews] = useState([])
  const [dart, setDart] = useState([])
  const [loadingContent, setLoadingContent] = useState(false)
  const [stockData, setStockData] = useState(null)
  const [health, setHealth] = useState(null)
  const [toast, setToast] = useState(null)
  const [marketData, setMarketData] = useState(null)
  const [copyingAll, setCopyingAll] = useState(false)

  // 리포트 생성 상태
  const [reportStatus, setReportStatus] = useState('idle') // idle | running | generating_pdf | done | error
  const [sseEvents, setSseEvents] = useState([])
  const [currentStockName, setCurrentStockName] = useState('')
  const [reportTrigger, setReportTrigger] = useState(0)
  const sseRef = useRef(null)

  // 초기 로드
  useEffect(() => {
    loadStocks()
    checkHealth()
    loadMarketData()
  }, [])

  // 종목 선택 시 뉴스/DART 로드
  useEffect(() => {
    if (!selectedStock) return
    setActiveTab('news')
    setActiveView('stock')
    loadContent(selectedStock)
  }, [selectedStock])

  async function loadMarketData() {
    try {
      const res = await fetch('/api/market')
      if (res.ok) setMarketData(await res.json())
    } catch { /* 실패 시 무시 */ }
  }

  async function checkHealth() {
    try {
      const res = await fetch('/api/health')
      setHealth(await res.json())
    } catch { setHealth({ server: 'error', dart: false }) }
  }

  async function loadStocks() {
    const res = await fetch('/api/stocks')
    const data = await res.json()
    setStocks(data)
    if (data.length > 0 && !selectedStock) setSelectedStock(data[0])
  }

  async function loadContent(stock) {
    setLoadingContent(true)
    setNews([]); setDart([]); setStockData(null)
    try {
      const [newsRes, dartRes, sdRes] = await Promise.all([
        fetch(`/api/news/${stock.code}?name=${encodeURIComponent(stock.name)}`),
        fetch(`/api/dart/${stock.code}?name=${encodeURIComponent(stock.name)}`),
        fetch(`/api/stockdata/${stock.code}`)
      ])
      setNews(await newsRes.json())
      setDart(await dartRes.json())
      setStockData(await sdRes.json())
    } catch (err) {
      showToast('수집 중 오류가 발생했습니다', 'error')
    } finally {
      setLoadingContent(false)
    }
  }

  async function handleAddStock(stock) {
    const res = await fetch('/api/stocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stock)
    })
    if (!res.ok) {
      const err = await res.json()
      showToast(err.error, 'error'); return
    }
    await loadStocks()
    showToast(`${stock.name} 추가됨`, 'success')
  }

  async function handleCopyForClaude() {
    if (!selectedStock) { showToast('종목을 먼저 선택하세요', 'error'); return }

    const payload = {
      request:
        `다음은 ${selectedStock.name}(${selectedStock.code}, ${selectedStock.market}) 종목의 최신 데이터와 시장 현황입니다. ` +
        `투자 관점에서 아래 항목을 분석해 주세요:\n` +
        `1. 핵심 이슈 요약 (뉴스/공시 기반)\n` +
        `2. 리스크 요인\n` +
        `3. 기회 요인\n` +
        `4. 시장 흐름(KOSPI/KOSDAQ)이 해당 종목에 미치는 영향\n` +
        `5. 단기(1개월) / 중기(3개월) 전망\n` +
        `6. 종합 투자 의견 (매수 / 관망 / 매도)`,
      market_overview: marketData ? {
        kospi:  marketData.kospi  ? {
          value:      marketData.kospi.value,
          change:     marketData.kospi.change,
          changeRate: marketData.kospi.changeRate,
          direction:  marketData.kospi.direction,
        } : null,
        kosdaq: marketData.kosdaq ? {
          value:      marketData.kosdaq.value,
          change:     marketData.kosdaq.change,
          changeRate: marketData.kosdaq.changeRate,
          direction:  marketData.kosdaq.direction,
        } : null,
        news: (marketData.news || []).map(n => ({
          title:       n.title,
          source:      n.source,
          pubDate:     n.pubDate,
          description: n.description || '',
        })),
      } : null,
      stock: {
        name: selectedStock.name,
        code: selectedStock.code,
        market: selectedStock.market,
        ...(stockData?.price       && { price:       stockData.price }),
        ...(stockData?.change      && { change:      stockData.change }),
        ...(stockData?.changeRate  && { changeRate:  stockData.changeRate }),
        ...(stockData?.foreignNet  && { foreignNet:  `${stockData.foreignNet}주` }),
        ...(stockData?.institutionNet && { institutionNet: `${stockData.institutionNet}주` }),
        ...(stockData?.per         && { per:         `${stockData.per}배` }),
        ...(stockData?.targetPrice && { targetPrice: `${stockData.targetPrice}원` }),
      },
      news: news.map(n => ({
        title:       n.title,
        source:      n.source,
        pubDate:     n.pubDate,
        description: n.description || '',
      })),
      dart_disclosures: dart.map(d => ({
        title:       d.title,
        type:        d.type,
        submittedAt: d.submittedAt,
      })),
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      showToast('클립보드에 복사됐습니다. Claude에 붙여넣기 하세요!', 'success')
    } catch {
      showToast('복사 실패 — 브라우저 권한을 확인하세요', 'error')
    }
  }

  async function handleCopyAllForClaude() {
    if (stocks.length === 0) { showToast('등록된 종목이 없습니다', 'error'); return }
    setCopyingAll(true)
    showToast(`전체 ${stocks.length}개 종목 수집 중...`, 'info')

    try {
      // 전체 종목 데이터 병렬 수집
      const stocksData = await Promise.all(
        stocks.map(async stock => {
          const [newsRes, dartRes, sdRes] = await Promise.allSettled([
            fetch(`/api/news/${stock.code}?name=${encodeURIComponent(stock.name)}`).then(r => r.json()),
            fetch(`/api/dart/${stock.code}?name=${encodeURIComponent(stock.name)}`).then(r => r.json()),
            fetch(`/api/stockdata/${stock.code}`).then(r => r.json()),
          ])
          const stockNews = newsRes.status === 'fulfilled' ? newsRes.value : []
          const stockDart = dartRes.status === 'fulfilled' ? dartRes.value : []
          const sd        = sdRes.status  === 'fulfilled' ? sdRes.value  : null

          return {
            name:   stock.name,
            code:   stock.code,
            market: stock.market,
            price_data: sd ? {
              ...(sd.price       && { price:       sd.price }),
              ...(sd.changeRate  && { changeRate:  sd.changeRate }),
              ...(sd.direction   && { direction:   sd.direction }),
              ...(sd.foreignNet  && { foreignNet:  `${sd.foreignNet}주` }),
              ...(sd.institutionNet && { institutionNet: `${sd.institutionNet}주` }),
              ...(sd.per         && { per:         `${sd.per}배` }),
              ...(sd.targetPrice && { targetPrice: `${sd.targetPrice}원` }),
            } : null,
            news: stockNews.map(n => ({
              title:       n.title,
              source:      n.source,
              pubDate:     n.pubDate,
              description: n.description || '',
            })),
            dart_disclosures: stockDart.map(d => ({
              title:       d.title,
              type:        d.type,
              submittedAt: d.submittedAt,
            })),
          }
        })
      )

      const marketOverview = marketData ? {
        kospi:  marketData.kospi  ? { value: marketData.kospi.value,  changeRate: marketData.kospi.changeRate,  direction: marketData.kospi.direction  } : null,
        kosdaq: marketData.kosdaq ? { value: marketData.kosdaq.value, changeRate: marketData.kosdaq.changeRate, direction: marketData.kosdaq.direction } : null,
        news: (marketData.news || []).map(n => ({ title: n.title, source: n.source, pubDate: n.pubDate, description: n.description || '' })),
      } : null

      const payload = {
        request:
          `다음은 관심 종목 ${stocks.length}개의 최신 데이터와 시장 현황입니다. ` +
          `각 종목에 대해 투자 관점에서 아래 항목을 분석하고, 마지막에 종목 간 비교 및 우선순위를 제시해 주세요:\n` +
          `1. 핵심 이슈 요약 (뉴스/공시 기반)\n` +
          `2. 리스크 / 기회 요인\n` +
          `3. 시장 흐름(KOSPI/KOSDAQ)이 각 종목에 미치는 영향\n` +
          `4. 단기(1개월) / 중기(3개월) 전망\n` +
          `5. 종합 투자 의견 (매수 / 관망 / 매도)\n` +
          `6. 전체 종목 중 투자 우선순위 랭킹`,
        market_overview: marketOverview,
        stocks: stocksData,
      }

      const content = JSON.stringify(payload, null, 2)
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
        .replace(/[^0-9]/g, '').slice(0, 12)
      a.href = url
      a.download = `stock_memo_${ts}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast(`메모 파일 저장 완료! (stock_memo_${ts}.json)`, 'success')
    } catch (err) {
      showToast('저장 실패 — ' + err.message, 'error')
    } finally {
      setCopyingAll(false)
    }
  }

  async function handleDeleteStock(code) {
    await fetch(`/api/stocks/${code}`, { method: 'DELETE' })
    if (selectedStock?.code === code) setSelectedStock(null)
    await loadStocks()
  }

  async function handleGenerate() {
    if (stocks.length === 0) { showToast('등록된 종목이 없습니다', 'error'); return }
    if (reportStatus === 'running') return

    setReportStatus('running')
    setSseEvents([])
    setCurrentStockName('')

    // 1. 생성 요청
    const res = await fetch('/api/report/generate', { method: 'POST' })
    const { jobId } = await res.json()

    // 2. SSE 연결
    if (sseRef.current) sseRef.current.close()
    const es = new EventSource(`/api/report/progress/${jobId}`)
    sseRef.current = es

    const handler = (type) => (e) => {
      const data = JSON.parse(e.data)
      setSseEvents(prev => [...prev, { type, ...data }])

      if (type === 'stock_start') setCurrentStockName(data.stockName)
      if (type === 'generating_pdf') setReportStatus('generating_pdf')
      if (type === 'done') {
        setReportStatus('done')
        setReportTrigger(t => t + 1)
        showToast(`리포트 생성 완료! ${data.filename}`, 'success')
        // 자동 다운로드
        const a = document.createElement('a')
        a.href = `/api/report/download/${data.filename}`
        a.download = data.filename
        a.click()
        es.close()
        setTimeout(() => setReportStatus('idle'), 3000)
      }
      if (type === 'error') {
        setReportStatus('error')
        showToast(data.message || '리포트 생성 실패', 'error')
        es.close()
        setTimeout(() => setReportStatus('idle'), 3000)
      }
    }

    ;['stock_start','collecting_news','collecting_dart','stock_done','generating_pdf','done','error']
      .forEach(type => es.addEventListener(type, handler(type)))
  }

  function showToast(message, type = 'info') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // 요약 탭 데이터
  const sourceMap = news.reduce((acc, n) => {
    const key = n.source || '기타'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000', overflow: 'hidden' }}>

      {/* 상단 네비 */}
      <div style={{
        height: 52, background: '#000', borderBottom: '1px solid #3c3c3c',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* M 트라이컬러 로고 */}
          <div style={{ display: 'flex', flexDirection: 'column', height: 18, width: 5, gap: 2 }}>
            <span style={{ flex: 1, background: '#0066b1', display: 'block' }} />
            <span style={{ flex: 1, background: '#1c69d4', display: 'block' }} />
            <span style={{ flex: 1, background: '#e22718', display: 'block' }} />
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '1.5px', color: '#fff' }}>
            STOCK NEWS REPORT
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {health && !health.dart && (
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', color: '#f4b400' }}>
              ⚠ DART 키 없음
            </span>
          )}
          <ModeToggle />
        </div>
      </div>

      {/* 바디 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* 사이드바 */}
        <div style={{ display: 'flex', flexDirection: 'column', width: 220, flexShrink: 0, borderRight: '1px solid #3c3c3c' }}>
          <StockSidebar
            stocks={stocks}
            onAdd={handleAddStock}
            onDelete={handleDeleteStock}
            onSelect={setSelectedStock}
            selectedCode={selectedStock?.code}
          />
          {/* 액션 버튼 영역 */}
          <div style={{ padding: 12, borderTop: '1px solid #3c3c3c', background: '#0d0d0d', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={handleGenerate}
              disabled={reportStatus === 'running' || reportStatus === 'generating_pdf' || stocks.length === 0}
            >
              {reportStatus === 'running' || reportStatus === 'generating_pdf' ? '생성 중...' : 'GENERATE REPORT'}
            </button>
            {reportStatus === 'done' && (
              <div style={{ fontSize: 13, color: '#0fa336', textAlign: 'center' }}>
                마지막 생성: {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {/* 리포트 기록 버튼 */}
            <button
              onClick={() => setActiveView(v => v === 'history' ? 'stock' : 'history')}
              style={{
                width: '100%', background: activeView === 'history' ? '#1a1a1a' : 'none',
                border: `1px solid ${activeView === 'history' ? '#fff' : '#3c3c3c'}`,
                color: activeView === 'history' ? '#fff' : '#bbbbbb',
                fontSize: 13, fontWeight: 700, letterSpacing: '1.5px',
                padding: '7px 0', textTransform: 'uppercase', cursor: 'pointer',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (activeView !== 'history') { e.currentTarget.style.borderColor = '#fff'; e.currentTarget.style.color = '#fff' } }}
              onMouseLeave={e => { if (activeView !== 'history') { e.currentTarget.style.borderColor = '#3c3c3c'; e.currentTarget.style.color = '#bbbbbb' } }}
            >
              REPORT HISTORY
            </button>
            {/* Claude 분석 복사 버튼 — 현재 종목 */}
            <button
              onClick={handleCopyForClaude}
              disabled={!selectedStock || news.length + dart.length === 0}
              style={{
                width: '100%', background: 'none', border: '1px solid #3c3c3c',
                color: selectedStock && news.length + dart.length > 0 ? '#bbbbbb' : '#3c3c3c',
                fontSize: 13, fontWeight: 700, letterSpacing: '1.5px',
                padding: '7px 0', textTransform: 'uppercase', transition: 'border-color 0.15s, color 0.15s',
                cursor: selectedStock && news.length + dart.length > 0 ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={e => {
                if (!selectedStock || news.length + dart.length === 0) return
                e.currentTarget.style.borderColor = '#1c69d4'; e.currentTarget.style.color = '#1c69d4'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#3c3c3c'
                e.currentTarget.style.color = selectedStock && news.length + dart.length > 0 ? '#bbbbbb' : '#3c3c3c'
              }}
            >
              COPY (현재 종목)
            </button>
            {/* Claude 분석 복사 버튼 — 전체 종목 */}
            <button
              onClick={handleCopyAllForClaude}
              disabled={stocks.length === 0 || copyingAll}
              style={{
                width: '100%', background: 'none', border: '1px solid #3c3c3c',
                color: stocks.length > 0 && !copyingAll ? '#bbbbbb' : '#3c3c3c',
                fontSize: 13, fontWeight: 700, letterSpacing: '1.5px',
                padding: '7px 0', textTransform: 'uppercase', transition: 'border-color 0.15s, color 0.15s',
                cursor: stocks.length > 0 && !copyingAll ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={e => {
                if (stocks.length === 0 || copyingAll) return
                e.currentTarget.style.borderColor = '#1c69d4'; e.currentTarget.style.color = '#1c69d4'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#3c3c3c'
                e.currentTarget.style.color = stocks.length > 0 && !copyingAll ? '#bbbbbb' : '#3c3c3c'
              }}
            >
              {copyingAll ? '수집 중...' : 'SAVE MEMO (전체 종목)'}
            </button>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── 리포트 기록 뷰 ── */}
          {activeView === 'history' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #3c3c3c', flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>리포트 기록</div>
                <div style={{ fontSize: 15, color: '#7e7e7e', marginTop: 4 }}>GENERATE REPORT로 생성된 전체 PDF 목록</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <ReportHistory refreshTrigger={reportTrigger} />
              </div>
            </div>

          /* ── 종목 뷰 ── */
          ) : selectedStock ? (
            <>
              {/* 종목 헤더 */}
              <div style={{ padding: '16px 24px 12px', borderBottom: '1px solid #3c3c3c', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{selectedStock.name}</div>
                  {stockData?.price && (
                    <div style={{
                      fontSize: 24, fontWeight: 700,
                      color: stockData.direction === 'up' ? '#0fa336' : stockData.direction === 'down' ? '#e22718' : '#bbbbbb'
                    }}>
                      {stockData.price}
                      <span style={{ fontSize: 17, marginLeft: 8 }}>
                        {stockData.direction === 'up' ? '▲' : stockData.direction === 'down' ? '▼' : '━'}
                        {' '}{stockData.change ? Math.abs(Number(stockData.change)).toLocaleString() : ''}
                        {' '}({stockData.changeRate})
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 15, color: '#7e7e7e', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '0 16px' }}>
                  <span>{selectedStock.code} · {selectedStock.market}{loadingContent && ' · 수집 중...'}</span>
                  {stockData?.foreignNet && (
                    <span>외국인 <span style={{ color: Number(stockData.foreignNet) >= 0 ? '#0fa336' : '#e22718', fontWeight: 700 }}>
                      {Number(stockData.foreignNet) >= 0 ? '+' : ''}{Number(stockData.foreignNet).toLocaleString()}주
                    </span></span>
                  )}
                  {stockData?.institutionNet && (
                    <span>기관 <span style={{ color: Number(stockData.institutionNet) >= 0 ? '#0fa336' : '#e22718', fontWeight: 700 }}>
                      {Number(stockData.institutionNet) >= 0 ? '+' : ''}{Number(stockData.institutionNet).toLocaleString()}주
                    </span></span>
                  )}
                  {stockData?.targetPrice && (
                    <span>목표주가 <span style={{ color: '#1c69d4', fontWeight: 700 }}>{stockData.targetPrice}원</span>{stockData.rating && ` (${stockData.rating})`}</span>
                  )}
                  {stockData?.per && <span>PER <span style={{ color: '#bbbbbb' }}>{stockData.per}배</span></span>}
                </div>
              </div>

              {/* 탭 바 */}
              <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid #3c3c3c', flexShrink: 0 }}>
                {[
                  { key: 'news', label: `뉴스 (${news.length})` },
                  { key: 'dart', label: `DART (${dart.length})` },
                  { key: 'summary', label: '요약' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      background: 'none', border: 'none',
                      borderBottom: activeTab === tab.key ? '2px solid #fff' : '2px solid transparent',
                      color: activeTab === tab.key ? '#fff' : '#7e7e7e',
                      fontSize: 15, fontWeight: 700, letterSpacing: '1px',
                      padding: '11px 18px 9px', cursor: 'pointer', marginBottom: -1,
                      textTransform: 'uppercase'
                    }}
                  >{tab.label}</button>
                ))}
              </div>

              {/* 콘텐츠 스크롤 영역 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>

                <ProgressPanel
                  stocks={stocks}
                  events={sseEvents}
                  currentStockName={currentStockName}
                  status={reportStatus}
                />
                {(reportStatus !== 'idle') && <div className="m-stripe" style={{ marginBottom: 18 }} />}

                {activeTab === 'news' && (
                  loadingContent
                    ? <div style={{ color: '#7e7e7e', fontSize: 16 }}>뉴스 수집 중...</div>
                    : news.length === 0
                      ? <div style={{ color: '#7e7e7e', fontSize: 16 }}>수집된 뉴스가 없습니다</div>
                      : news.map((item, i) => <NewsCard key={i} item={item} />)
                )}

                {activeTab === 'dart' && (
                  loadingContent
                    ? <div style={{ color: '#7e7e7e', fontSize: 16 }}>공시 수집 중...</div>
                    : dart.length === 0
                      ? <div style={{ padding: '20px 0', color: '#7e7e7e', fontSize: 16 }}>해당 기간 공시 없음</div>
                      : dart.map((item, i) => <DartCard key={i} item={item} />)
                )}

                {activeTab === 'summary' && (
                  <div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                      {[
                        { label: '뉴스', count: news.length, color: '#bbbbbb' },
                        { label: 'DART 공시', count: dart.length, color: '#1c69d4' },
                      ].map(({ label, count, color }) => (
                        <div key={label} style={{
                          flex: 1, background: '#0d0d0d', border: '1px solid #3c3c3c',
                          padding: '20px 16px', textAlign: 'center'
                        }}>
                          <div style={{ fontSize: 42, fontWeight: 700, color }}>{count}</div>
                          <div className="label-upper" style={{ marginTop: 8, color: '#7e7e7e' }}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {Object.keys(sourceMap).length > 0 && (
                      <>
                        <div className="label-upper" style={{ marginBottom: 10, color: '#7e7e7e' }}>출처별 뉴스</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).map(([src, cnt]) => (
                            <div key={src} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              background: '#0d0d0d', border: '1px solid #3c3c3c', padding: '10px 16px'
                            }}>
                              <span style={{ fontSize: 16, fontWeight: 700, color: '#e6e6e6' }}>{src}</span>
                              <span style={{ fontSize: 16, fontWeight: 700, color: '#7e7e7e' }}>{cnt}건</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {dart.length > 0 && (
                      <>
                        <div className="label-upper" style={{ marginTop: 24, marginBottom: 10, color: '#7e7e7e' }}>최신 DART 공시</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {dart.slice(0, 5).map((d, i) => (
                            <div key={i} style={{
                              background: '#0d0d0d', border: '1px solid #3c3c3c',
                              borderLeft: '2px solid #1c69d4', padding: '10px 16px'
                            }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#1c69d4' }}>
                                {d.type}{d.submittedAt ? ' · ' + d.submittedAt : ''}
                              </span>
                              <div style={{ fontSize: 16, fontWeight: 700, color: '#e6e6e6', marginTop: 5 }}>{d.title}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: 36, width: 9, gap: 3 }}>
                <span style={{ flex: 1, background: '#0066b1', display: 'block' }} />
                <span style={{ flex: 1, background: '#1c69d4', display: 'block' }} />
                <span style={{ flex: 1, background: '#e22718', display: 'block' }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#7e7e7e' }}>
                왼쪽에서 종목을 추가하세요
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          background: '#1a1a1a', border: `1px solid ${toast.type === 'error' ? '#e22718' : toast.type === 'success' ? '#0fa336' : '#3c3c3c'}`,
          padding: '12px 20px', maxWidth: 320
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e6e6e6' }}>{toast.message}</span>
        </div>
      )}
    </div>
  )
}
