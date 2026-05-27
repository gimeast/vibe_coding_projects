import { useState, useEffect } from 'react'

export default function ModeToggle() {
  const [config, setConfig] = useState({ enabled: false, hour: 8, minute: 0 })
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    fetch('/api/scheduler/status').then(r => r.json()).then(setConfig).catch(() => {})
  }, [])

  async function toggleMode() {
    const next = { ...config, enabled: !config.enabled }
    const res = await fetch('/api/scheduler/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next)
    })
    setConfig(await res.json())
  }

  async function setTime(hour, minute) {
    const next = { ...config, hour, minute }
    const res = await fetch('/api/scheduler/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next)
    })
    setConfig(await res.json())
    setShowPicker(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="label-upper" style={{ color: config.enabled ? '#7e7e7e' : '#fff' }}>수동</span>

      {/* 토글 */}
      <button
        onClick={toggleMode}
        style={{
          width: 40, height: 20, background: '#1a1a1a',
          border: '1px solid #3c3c3c', borderRadius: 10,
          position: 'relative', cursor: 'pointer', outline: 'none'
        }}
      >
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: config.enabled ? '#0066b1' : '#3c3c3c',
          position: 'absolute', top: 2,
          left: config.enabled ? 22 : 2,
          transition: 'left 0.2s, background 0.2s'
        }} />
      </button>

      <span className="label-upper" style={{ color: config.enabled ? '#fff' : '#7e7e7e' }}>자동</span>

      {config.enabled && (
        <div style={{ position: 'relative' }}>
          <button className="btn-ghost" onClick={() => setShowPicker(!showPicker)}
            style={{ fontSize: 10, padding: '4px 8px' }}>
            {String(config.hour).padStart(2, '0')}:{String(config.minute).padStart(2, '0')}
          </button>
          {showPicker && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, background: '#1a1a1a',
              border: '1px solid #3c3c3c', padding: 12, zIndex: 50, minWidth: 140
            }}>
              <div className="label-upper" style={{ marginBottom: 8 }}>시간 설정</div>
              {[8, 9, 10].map(h => [0, 30].map(m => (
                <button key={`${h}:${m}`} onClick={() => setTime(h, m)}
                  style={{
                    display: 'block', width: '100%', background: 'transparent',
                    border: '1px solid #3c3c3c', color: '#e6e6e6',
                    padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                    fontWeight: 700, marginBottom: 4, textAlign: 'left'
                  }}>
                  매일 {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
                </button>
              )))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
