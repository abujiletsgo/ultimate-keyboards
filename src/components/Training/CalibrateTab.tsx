import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrainingStore } from '../../stores/trainingStore'

const PANGRAM = 'the quick brown fox jumps over the lazy dog'

type Status = 'idle' | 'typing' | 'done'

export default function CalibrateTab() {
  const { chordWindowMs, setChordWindow } = useTrainingStore()

  const [typedCount, setTypedCount] = useState(0)
  const [timestamps, setTimestamps] = useState<number[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [suggested, setSuggested] = useState<number | null>(null)
  const [medianMs, setMedianMs] = useState<number | null>(null)
  const [applied, setApplied] = useState(false)

  const lastKeyTime = useRef<number | null>(null)
  const intervalsRef = useRef<number[]>([])

  const computeResult = useCallback((intervals: number[]) => {
    if (intervals.length === 0) return
    const sorted = [...intervals].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid]
    const sug = Math.round(median * 0.7)
    const clamped = Math.max(20, Math.min(120, sug))
    setMedianMs(Math.round(median))
    setSuggested(clamped)
    setTimestamps(intervals.slice(0, 20)) // store for visualization
  }, [])

  useEffect(() => {
    if (status !== 'typing') return

    const onKeyDown = (e: KeyboardEvent) => {
      // Only track printable characters matching pangram
      if (e.key.length !== 1 && e.key !== ' ') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const now = performance.now()
      if (lastKeyTime.current !== null) {
        const interval = now - lastKeyTime.current
        if (interval < 2000) {
          // ignore pauses > 2s
          intervalsRef.current.push(interval)
        }
      }
      lastKeyTime.current = now

      setTypedCount((prev) => {
        const next = prev + 1
        if (next >= PANGRAM.length) {
          setStatus('done')
          computeResult(intervalsRef.current)
        }
        return next
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [status, computeResult])

  const handleStart = () => {
    setTypedCount(0)
    setTimestamps([])
    setStatus('typing')
    setSuggested(null)
    setMedianMs(null)
    setApplied(false)
    lastKeyTime.current = null
    intervalsRef.current = []
  }

  const handleApply = () => {
    if (suggested !== null) {
      setChordWindow(suggested)
      setApplied(true)
    }
  }

  // Visualization: show up to 10 intervals as bars
  const vizIntervals = timestamps.slice(0, 10)
  const maxInterval = vizIntervals.length > 0 ? Math.max(...vizIntervals) : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
          Calibrate Chord Window
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Type the sentence below naturally. We'll measure your keystroke timing
          to suggest the optimal chord window.
        </p>
      </div>

      {/* Pangram display */}
      <div
        style={{
          padding: '24px',
          borderRadius: '10px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Type this sentence to calibrate:
        </div>
        <div style={{ fontSize: '22px', fontFamily: 'monospace', letterSpacing: '1px', lineHeight: 1.6 }}>
          {PANGRAM.split('').map((char, i) => {
            let color: string
            if (i < typedCount) {
              color = 'var(--success)'
            } else if (i === typedCount && status === 'typing') {
              color = 'var(--accent)'
            } else {
              color = 'var(--text-muted)'
            }
            return (
              <span
                key={i}
                style={{
                  color,
                  background:
                    i === typedCount && status === 'typing'
                      ? 'rgba(99,102,241,0.18)'
                      : 'transparent',
                  borderRadius: '2px',
                  transition: 'color 0.05s',
                }}
              >
                {char === ' ' ? '\u00a0' : char}
              </span>
            )
          })}
        </div>

        {status === 'idle' && (
          <div style={{ marginTop: '16px' }}>
            <button
              onClick={handleStart}
              style={{
                padding: '10px 28px',
                borderRadius: '8px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 600,
              }}
            >
              Start Typing
            </button>
          </div>
        )}

        {status === 'typing' && (
          <div style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
            {typedCount} / {PANGRAM.length} characters
          </div>
        )}
      </div>

      {/* Results */}
      {status === 'done' && medianMs !== null && suggested !== null && (
        <div
          style={{
            padding: '24px',
            borderRadius: '10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Your median keystroke interval
            </div>
            <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>
              {medianMs}ms
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px' }}>
              Suggested chord window (median × 0.7):
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>
              {suggested}ms
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Current: {chordWindowMs}ms
            </div>
          </div>

          {/* Timing bar visualization */}
          {vizIntervals.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Sample intervals (first {vizIntervals.length}):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {vizIntervals.map((interval, i) => {
                  const pct = (interval / maxInterval) * 100
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '30px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
                        {Math.round(interval)}
                      </div>
                      <div
                        style={{
                          height: '12px',
                          width: `${pct}%`,
                          background: interval < suggested ? 'var(--success)' : 'var(--accent)',
                          borderRadius: '2px',
                          transition: 'width 0.3s',
                          minWidth: '2px',
                        }}
                      />
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ms</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={handleApply}
              disabled={applied}
              style={{
                padding: '10px 28px',
                borderRadius: '8px',
                background: applied ? 'var(--bg-tertiary)' : 'var(--accent)',
                color: applied ? 'var(--text-muted)' : 'white',
                border: 'none',
                cursor: applied ? 'not-allowed' : 'pointer',
                fontSize: '15px',
                fontWeight: 600,
              }}
            >
              {applied ? `Applied (${suggested}ms)` : `Apply ${suggested}ms`}
            </button>
            <button
              onClick={handleStart}
              style={{
                padding: '10px 28px',
                borderRadius: '8px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                fontSize: '15px',
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
