import { useState, useRef, useEffect } from 'react'

export default function StockSidebar({ stocks, onAdd, onDelete, onSelect, selectedCode }) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const dropdownRef = useRef(null)

  // 하이라이트 항목이 보이도록 스크롤
  useEffect(() => {
    if (highlightedIndex < 0 || !dropdownRef.current) return
    const items = dropdownRef.current.querySelectorAll('button')
    items[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  // 검색 결과 바뀌면 하이라이트 초기화
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchResults])

  async function handleSearch(e) {
    const q = e.target.value
    setQuery(q)
    if (q.length < 1) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`)
      setSearchResults(await res.json())
    } finally {
      setSearching(false)
    }
  }

  function handleKeyDown(e) {
    if (searchResults.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev + 1) % searchResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => prev <= 0 ? searchResults.length - 1 : prev - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = highlightedIndex >= 0 ? searchResults[highlightedIndex] : searchResults[0]
      if (target) handleAdd(target)
    } else if (e.key === 'Escape') {
      setSearchResults([])
      setHighlightedIndex(-1)
    }
  }

  async function handleAdd(stock) {
    await onAdd(stock)
    setQuery('')
    setSearchResults([])
    setHighlightedIndex(-1)
  }

  return (
    <div style={{
      width: 220, background: '#0d0d0d',
      display: 'flex', flexDirection: 'column', flexShrink: 0, flex: 1, overflow: 'hidden'
    }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #3c3c3c' }}>
        <div className="label-upper" style={{ marginBottom: 10 }}>
          관심 종목 ({stocks.length}/20)
        </div>
        <div style={{ position: 'relative' }}>
          <input
            className="dark-input"
            placeholder="종목명 또는 코드..."
            value={query}
            onChange={handleSearch}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          {/* 검색 드롭다운 */}
          {searchResults.length > 0 && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: '#1a1a1a', border: '1px solid #3c3c3c', borderTop: 'none',
                maxHeight: 240, overflowY: 'auto'
              }}
            >
              {searchResults.map((s, idx) => (
                <button
                  key={s.code}
                  onClick={() => handleAdd(s)}
                  style={{
                    width: '100%', border: 'none',
                    borderBottom: '1px solid #3c3c3c', padding: '8px 10px',
                    textAlign: 'left', cursor: 'pointer', color: '#e6e6e6',
                    background: idx === highlightedIndex ? '#2a2a2a' : 'transparent',
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onMouseLeave={() => setHighlightedIndex(-1)}
                >
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 14, color: '#7e7e7e' }}>{s.code}{s.market ? ` · ${s.market}` : ''}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 종목 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {stocks.length === 0 && (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: '#7e7e7e', fontSize: 13 }}>
            종목을 검색해서 추가하세요
          </div>
        )}
        {stocks.map(stock => (
          <div
            key={stock.code}
            onClick={() => onSelect(stock)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#1a1a1a', border: `1px solid ${selectedCode === stock.code ? '#0066b1' : '#3c3c3c'}`,
              padding: '8px 10px', marginBottom: 4, cursor: 'pointer',
              transition: 'border-color 0.15s'
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{stock.name}</div>
              <div style={{ fontSize: 14, color: '#7e7e7e', marginTop: 2 }}>
                {stock.code} · {stock.market}
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(stock.code) }}
              style={{
                background: 'none', border: 'none', color: '#3c3c3c',
                fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#e22718'}
              onMouseLeave={e => e.currentTarget.style.color = '#3c3c3c'}
            >×</button>
          </div>
        ))}
      </div>

      {/* 하단 안내 */}
      <div style={{ padding: 12, borderTop: '1px solid #3c3c3c' }}>
        <div style={{ fontSize: 12, color: '#7e7e7e', textAlign: 'center', lineHeight: 1.5 }}>
          위 검색창에서 종목을 찾아 추가하세요
        </div>
      </div>
    </div>
  )
}
