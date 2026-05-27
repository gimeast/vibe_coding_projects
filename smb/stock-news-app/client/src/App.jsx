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
  const [activeTab, setActiveTab] = useState('news') // 'news' | 'dart' | 'summary' | 'history'
  const [news, setNews] = useState([])
  const [dart, setDart] = useState([])
  const [loadingContent, setLoadingContent] = useState(false)
  const [health, setHealth] = useState(null)
  const [toast, setToast] = useState(null)

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
  }, [])

  // 종목 선택 시 뉴스/DART 로드
  useEffect(() => {
    if (!selectedStock) return
    setActiveTab('news')
    loadContent(selectedStock)
  }, [selectedStock])

  async function checkHealth() {
    try {
      const res = await fetch('/api/health')
      setHealth(await res.json())
    } catch { setHealth({ server: 'error', ollama: 'offline', dart: false }) }
  }

  async function loadStocks() {
    const res = await fetch('/api/stocks')
    const data = await res.json()
    setStocks(data)
    if (data.length > 0 && !selectedStock) setSelectedStock(data[0])
  }

  async function loadContent(stock) {
    setLoadingContent(true)
    setNews([]); setDart([])
    try {
      const [newsRes, dartRes] = await Promise.all([
        fetch(`/api/news/${stock.code}?name=${encodeURIComponent(stock.name)}`),
        fetch(`/api/dart/${stock.code}?name=${encodeURIComponent(stock.name)}`)
      ])
      setNews(await newsRes.json())
      setDart(await dartRes.json())
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

    ;['stock_start','collecting_news','collecting_dart','summarizing','summarizing_dart','stock_done','generating_pdf','done','error']
      .forEach(type => es.addEventListener(type, handler(type)))
  }

  function showToast(message, type = 'info') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // 요약 탭 데이터
  const upCount = news.filter(n => n.ai?.impact === '상승요인').length
  const downCount = news.filter(n => n.ai?.impact === '하락요인').length
  const neutralCount = news.length - upCount - downCount

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
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '1.5px', color: '#fff' }}>
            STOCK NEWS REPORT
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {health && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
              color: health.ollama === 'ok' ? '#0fa336' : '#e22718'
            }}>
              {health.ollama === 'ok' ? '● OLLAMA' : '○ OLLAMA OFFLINE'}
            </span>
          )}
          {health && !health.dart && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: '#f4b400' }}>
              ⚠ DART 키 없음
            </span>
          )}
          <ModeToggle />
        </div>
      </div>

      {/* 바디 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* 사이드바 */}
        <div style={{ display: 'flex', flexDirection: 'column', width: 220, flexShrink: 0 }}>
          <StockSidebar
            stocks={stocks}
            onAdd={handleAddStock}
            onDelete={handleDeleteStock}
            onSelect={setSelectedStock}
            selectedCode={selectedStock?.code}
          />
          {/* GENERATE 버튼 */}
          <div style={{ padding: 12, borderTop: '1px solid #3c3c3c', background: '#0d0d0d', flexShrink: 0 }}>
            <button
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={handleGenerate}
              disabled={reportStatus === 'running' || reportStatus === 'generating_pdf' || stocks.length === 0}
            >
              {reportStatus === 'running' || reportStatus === 'generating_pdf' ? '생성 중...' : 'GENERATE REPORT'}
            </button>
            {reportStatus === 'done' && (
              <div style={{ fontSize: 9, color: '#0fa336', textAlign: 'center', marginTop: 6, letterSpacing: '0.5px' }}>
                마지막 생성: {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {selectedStock ? (
            <>
              {/* 종목 헤더 */}
              <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #3c3c3c', flexShrink: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{selectedStock.name}</div>
                <div style={{ fontSize: 11, color: '#7e7e7e', marginTop: 3, letterSpacing: '0.5px' }}>
                  {selectedStock.code} · {selectedStock.market}
                  {loadingContent && ' · 수집 중...'}
                </div>
              </div>

              {/* 탭 바 */}
              <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid #3c3c3c', flexShrink: 0 }}>
                {[
                  { key: 'news', label: `뉴스 (${news.length})` },
                  { key: 'dart', label: `DART (${dart.length})` },
                  { key: 'summary', label: '요약' },
                  { key: 'history', label: '리포트 기록' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      background: 'none', border: 'none',
                      borderBottom: activeTab === tab.key ? '2px solid #fff' : '2px solid transparent',
                      color: activeTab === tab.key ? '#fff' : '#7e7e7e',
                      fontSize: 11, fontWeight: 700, letterSpacing: '1.5px',
                      padding: '10px 16px 8px', cursor: 'pointer', marginBottom: -1,
                      textTransform: 'uppercase'
                    }}
                  >{tab.label}</button>
                ))}
              </div>

              {/* 콘텐츠 스크롤 영역 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

                {/* 진행 패널 */}
                <ProgressPanel
                  stocks={stocks}
                  events={sseEvents}
                  currentStockName={currentStockName}
                  status={reportStatus}
                />

                {/* M 스트라이프 구분선 */}
                {(reportStatus !== 'idle') && <div className="m-stripe" style={{ marginBottom: 16 }} />}

                {activeTab === 'news' && (
                  loadingContent
                    ? <div style={{ color: '#7e7e7e', fontSize: 12 }}>뉴스 수집 중...</div>
                    : news.length === 0
                      ? <div style={{ color: '#7e7e7e', fontSize: 12 }}>수집된 뉴스가 없습니다</div>
                      : news.map((item, i) => <NewsCard key={i} item={item} />)
                )}

                {activeTab === 'dart' && (
                  loadingContent
                    ? <div style={{ color: '#7e7e7e', fontSize: 12 }}>공시 수집 중...</div>
                    : dart.length === 0
                      ? <div style={{ padding: '20px 0', color: '#7e7e7e', fontSize: 12 }}>해당 기간 공시 없음</div>
                      : dart.map((item, i) => <DartCard key={i} item={item} />)
                )}

                {activeTab === 'summary' && (
                  <div>
                    <div className="label-upper" style={{ marginBottom: 12 }}>뉴스 영향 요약</div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                      {[
                        { label: '상승요인', count: upCount, color: '#0fa336' },
                        { label: '하락요인', count: downCount, color: '#e22718' },
                        { label: '중립', count: neutralCount, color: '#7e7e7e' },
                        { label: 'DART 공시', count: dart.length, color: '#1c69d4' },
                      ].map(({ label, count, color }) => (
                        <div key={label} style={{
                          flex: 1, background: '#0d0d0d', border: '1px solid #3c3c3c',
                          padding: '16px 12px', textAlign: 'center'
                        }}>
                          <div style={{ fontSize: 32, fontWeight: 700, color }}>{count}</div>
                          <div className="label-upper" style={{ marginTop: 4, color: '#7e7e7e' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'history' && (
                  <ReportHistory refreshTrigger={reportTrigger} />
                )}
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: 32, width: 8, gap: 3 }}>
                <span style={{ flex: 1, background: '#0066b1', display: 'block' }} />
                <span style={{ flex: 1, background: '#1c69d4', display: 'block' }} />
                <span style={{ flex: 1, background: '#e22718', display: 'block' }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '1px', color: '#7e7e7e' }}>
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
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e6e6e6' }}>{toast.message}</span>
        </div>
      )}
    </div>
  )
}
