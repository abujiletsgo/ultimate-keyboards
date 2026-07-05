import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getRandomWords, INTERMEDIATE_WORDS } from '../../lib/wordList'

type Mode = 30 | 60 | 120
type Status = 'idle' | 'running' | 'done'

const WORD_COUNT = 60

function generateWordList(): string[] {
  return getRandomWords(INTERMEDIATE_WORDS, WORD_COUNT)
}

export default function TestTab() {
  const [mode, setMode] = useState<Mode>(60)
  const [status, setStatus] = useState<Status>('idle')
  const [timeLeft, setTimeLeft] = useState<number>(60)
  const [wordList, setWordList] = useState<string[]>(generateWordList)
  const [typed, setTyped] = useState('')
  const [correctChars, setCorrectChars] = useState(0)
  const [totalChars, setTotalChars] = useState(0)

  const timerRef = useRef<number | null>(null)
  // Keep a ref to typed so keydown handler always sees latest value without stale closure
  const typedRef = useRef('')
  const statusRef = useRef<Status>('idle')
  const expectedTextRef = useRef('')

  // Debug: log last 20 key events received
  const [keyLog, setKeyLog] = useState<string[]>([])

  // Build the full expected string (words joined by spaces)
  const expectedText = wordList.join(' ')
  expectedTextRef.current = expectedText

  const finishTest = useCallback((typedSoFar: string) => {
    statusRef.current = 'done'
    setStatus('done')
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    // Compute final stats
    const expected = expectedTextRef.current
    let correct = 0
    let total = 0
    for (let i = 0; i < typedSoFar.length; i++) {
      total++
      if (i < expected.length && typedSoFar[i] === expected[i]) {
        correct++
      }
    }
    setCorrectChars(correct)
    setTotalChars(total)
  }, [])

  const startTimer = useCallback((duration: number) => {
    setTimeLeft(duration)
    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // When timeLeft hits 0 during running, finish
  useEffect(() => {
    if (status === 'running' && timeLeft === 0) {
      finishTest(typedRef.current)
    }
  }, [timeLeft, status, finishTest])

  // Window-level keydown handler — avoids browser stealing space for scroll
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const label = e.key === ' ' ? '·SPACE·' : e.key.length === 1 ? e.key : `[${e.key}]`
      setKeyLog((prev) => [...prev.slice(-19), label])

      const currentStatus = statusRef.current
      if (currentStatus === 'done') return

      // Only handle printable characters and backspace
      if (e.key === 'Backspace') {
        e.preventDefault()
        const next = typedRef.current.slice(0, -1)
        typedRef.current = next
        setTyped(next)
        return
      }

      // Single printable character (letters, space, punctuation)
      if (e.key.length !== 1) return
      e.preventDefault()

      const next = typedRef.current + e.key
      const expected = expectedTextRef.current

      // Don't type past end
      if (next.length > expected.length) return

      // Start timer on first keystroke
      if (currentStatus === 'idle') {
        statusRef.current = 'running'
        setStatus('running')
        startTimer(mode)
      }

      typedRef.current = next
      setTyped(next)

      if (next.length >= expected.length) {
        finishTest(next)
      }
    }

    // Also block keyup for space so focused buttons don't activate
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && statusRef.current !== 'done') {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [mode, startTimer, finishTest])

  const handleReset = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    typedRef.current = ''
    statusRef.current = 'idle'
    setStatus('idle')
    setTyped('')
    setTimeLeft(mode)
    setWordList(generateWordList())
    setCorrectChars(0)
    setTotalChars(0)
  }, [mode])

  const handleModeChange = (m: Mode) => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    typedRef.current = ''
    statusRef.current = 'idle'
    setMode(m)
    setStatus('idle')
    setTyped('')
    setTimeLeft(m)
    setWordList(generateWordList())
    setCorrectChars(0)
    setTotalChars(0)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [])

  const wpm = totalChars > 0 ? Math.round((correctChars / 5) / (mode / 60)) : 0
  const accuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100

  // Find current word index
  const typedWords = typed.split(' ')
  const currentWordIdx = typedWords.length - 1

  if (status === 'done') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '32px',
          minHeight: '400px',
        }}
      >
        <div
          style={{
            padding: '48px 64px',
            borderRadius: '16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '2px' }}>
            Results — {mode}s test
          </div>

          <div style={{ display: 'flex', gap: '48px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <div style={{ fontSize: '64px', fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace', lineHeight: 1 }}>
                {wpm}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>WPM</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <div style={{ fontSize: '64px', fontWeight: 800, color: 'var(--success)', fontFamily: 'monospace', lineHeight: 1 }}>
                {accuracy}%
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Accuracy</div>
            </div>
          </div>

          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {correctChars} correct / {totalChars} total chars
          </div>

          <button
            onClick={handleReset}
            tabIndex={-1}
            style={{
              padding: '12px 36px',
              borderRadius: '8px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600,
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top bar: timer + mode */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {([30, 60, 120] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              disabled={status === 'running'}
              tabIndex={-1}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: mode === m ? 'var(--accent)' : 'var(--bg-secondary)',
                color: mode === m ? 'white' : 'var(--text-muted)',
                cursor: status === 'running' ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: mode === m ? 600 : 400,
              }}
            >
              {m}s
            </button>
          ))}
        </div>

        <div
          style={{
            fontSize: '32px',
            fontWeight: 700,
            fontFamily: 'monospace',
            color: timeLeft <= 10 && status === 'running' ? 'var(--danger)' : 'var(--text)',
            minWidth: '60px',
            textAlign: 'right',
          }}
        >
          {status === 'idle' ? mode : timeLeft}
        </div>
      </div>

      {/* Word display */}
      <div
        style={{
          padding: '24px',
          borderRadius: '10px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          fontSize: '20px',
          lineHeight: '2',
          fontFamily: 'monospace',
          maxHeight: '200px',
          overflow: 'hidden',
          position: 'relative',
          cursor: 'text',
          userSelect: 'none',
        }}
      >
        {status === 'idle' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '16px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '10px',
              backdropFilter: 'blur(2px)',
            }}
          >
            Click here or start typing to begin
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 0' }}>
          {wordList.map((word, wIdx) => {
            const startChar = wordList.slice(0, wIdx).reduce((s, w) => s + w.length + 1, 0)
            const isCurrentWord = wIdx === currentWordIdx && status === 'running'

            return (
              <React.Fragment key={wIdx}>
                {wIdx > 0 && (
                  <span
                    style={{
                      color:
                        startChar - 1 < typed.length
                          ? typed[startChar - 1] === ' '
                            ? 'var(--text-muted)'
                            : 'var(--danger)'
                          : startChar - 1 === typed.length
                          ? 'var(--accent)'
                          : 'var(--text-muted)',
                    }}
                  >
                    &nbsp;
                  </span>
                )}
                <span
                  style={{
                    background: isCurrentWord ? 'rgba(99,102,241,0.12)' : 'transparent',
                    borderRadius: '3px',
                    padding: '0 1px',
                  }}
                >
                  {word.split('').map((char, cIdx) => {
                    const absIdx = startChar + cIdx
                    let color = 'var(--text-muted)'
                    let bg = 'transparent'

                    if (absIdx < typed.length) {
                      if (typed[absIdx] === char) {
                        color = 'rgba(134,239,172,0.7)' // muted green
                      } else {
                        color = 'var(--danger)'
                        bg = 'rgba(239,68,68,0.15)'
                      }
                    } else if (absIdx === typed.length) {
                      color = 'var(--text)'
                      bg = 'rgba(99,102,241,0.3)' // cursor highlight
                    }

                    return (
                      <span
                        key={cIdx}
                        style={{ color, background: bg, borderRadius: '2px' }}
                      >
                        {char}
                      </span>
                    )
                  })}
                </span>
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Helper text */}
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        {status === 'idle'
          ? 'Start typing to begin the timer'
          : status === 'running'
          ? `${typed.split(' ').length} words typed`
          : ''}
      </div>

      {/* Debug key log */}
      <div
        style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: '#111',
          border: '1px solid #333',
          fontFamily: 'monospace',
          fontSize: '13px',
        }}
      >
        <div style={{ color: '#666', marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Key events received (last 20) — space shows as ·SPACE·
        </div>
        <div style={{ color: '#0f0', wordBreak: 'break-all', lineHeight: '1.8' }}>
          {keyLog.length === 0
            ? <span style={{ color: '#444' }}>nothing yet — start typing</span>
            : keyLog.map((k, i) => (
              <span
                key={i}
                style={{
                  marginRight: '6px',
                  color: k === '·SPACE·' ? '#ff0' : '#0f0',
                  background: k === '·SPACE·' ? 'rgba(255,255,0,0.1)' : 'transparent',
                  borderRadius: '3px',
                  padding: '0 2px',
                }}
              >
                {k}
              </span>
            ))
          }
        </div>
      </div>
    </div>
  )
}
