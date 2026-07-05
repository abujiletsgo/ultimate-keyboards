import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChordDetector } from '../../lib/chordDetector'
import { getRandomWords, getWordsByDifficulty } from '../../lib/wordList'
import { useTrainingStore } from '../../stores/trainingStore'
import KeyboardLayout from './KeyboardLayout'

type Difficulty = 'beginner' | 'intermediate' | 'advanced'
type Feedback = 'idle' | 'correct' | 'wrong'

interface Stats {
  correct: number
  total: number
  streak: number
  startTime: Date | null
}

function getUniqueLetters(word: string): Set<string> {
  return new Set(word.toLowerCase().replace(/[^a-z]/g, '').split(''))
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) {
    if (!b.has(v)) return false
  }
  return true
}

export default function PracticeTab() {
  const { chordWindowMs, difficulty, setDifficulty } = useTrainingStore()

  const [wordQueue, setWordQueue] = useState<string[]>(() =>
    getRandomWords(getWordsByDifficulty('beginner'), 10)
  )
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [currentChord, setCurrentChord] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState<Stats>({
    correct: 0,
    total: 0,
    streak: 0,
    startTime: null,
  })
  const [feedback, setFeedback] = useState<Feedback>('idle')

  const detectorRef = useRef<ChordDetector | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)

  const currentWord = wordQueue[currentWordIndex] ?? ''

  // Refill word queue when running low
  const checkRefill = useCallback(
    (queue: string[], index: number) => {
      const remaining = queue.length - index
      if (remaining < 3) {
        const newWords = getRandomWords(getWordsByDifficulty(difficulty), 10)
        return [...queue, ...newWords]
      }
      return queue
    },
    [difficulty]
  )

  const handleChord = useCallback(
    (chord: Set<string>) => {
      const target = getUniqueLetters(currentWord)
      const isCorrect = setsEqual(chord, target)

      if (feedbackTimerRef.current !== null) {
        clearTimeout(feedbackTimerRef.current)
      }

      setFeedback(isCorrect ? 'correct' : 'wrong')
      setStats((prev) => ({
        ...prev,
        correct: isCorrect ? prev.correct + 1 : prev.correct,
        total: prev.total + 1,
        streak: isCorrect ? prev.streak + 1 : 0,
        startTime: prev.startTime ?? new Date(),
      }))

      if (isCorrect) {
        setCurrentWordIndex((prev) => {
          const next = prev + 1
          setWordQueue((q) => checkRefill(q, next))
          return next
        })
      }

      feedbackTimerRef.current = window.setTimeout(() => {
        setFeedback('idle')
      }, 400)
    },
    [currentWord, checkRefill]
  )

  const handleUpdate = useCallback((current: Set<string>) => {
    setCurrentChord(new Set(current))
  }, [])

  // Recreate detector when chordWindowMs changes
  useEffect(() => {
    const detector = new ChordDetector(chordWindowMs, handleChord, handleUpdate)
    detectorRef.current = detector

    const onKeyDown = (e: KeyboardEvent) => {
      // Prevent default for letter keys so page doesn't scroll etc.
      if (/^[a-z]$/i.test(e.key)) {
        e.preventDefault()
      }
      detector.handleKeyDown(e.key.toLowerCase())
    }
    const onKeyUp = (e: KeyboardEvent) => {
      detector.handleKeyUp(e.key.toLowerCase())
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      detector.destroy()
    }
  }, [chordWindowMs, handleChord, handleUpdate])

  // When difficulty changes, reset queue
  const handleDifficultyChange = (d: Difficulty) => {
    setDifficulty(d)
    const newWords = getRandomWords(getWordsByDifficulty(d), 10)
    setWordQueue(newWords)
    setCurrentWordIndex(0)
    setStats({ correct: 0, total: 0, streak: 0, startTime: null })
    setFeedback('idle')
  }

  const accuracy =
    stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 100

  const targetLetters = getUniqueLetters(currentWord)

  const feedbackBorderColor =
    feedback === 'correct'
      ? 'var(--success)'
      : feedback === 'wrong'
      ? 'var(--danger)'
      : undefined

  const feedbackBg =
    feedback === 'correct'
      ? 'rgba(74,222,128,0.08)'
      : feedback === 'wrong'
      ? 'rgba(251,113,133,0.08)'
      : undefined

  const feedbackGlow =
    feedback === 'correct'
      ? '0 0 24px rgba(74,222,128,0.30)'
      : feedback === 'wrong'
      ? '0 0 24px rgba(251,113,133,0.30)'
      : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Difficulty selector */}
      <div className="seg-ctrl" style={{ margin: '0 auto' }}>
        {(['beginner', 'intermediate', 'advanced'] as Difficulty[]).map((d) => (
          <button
            key={d}
            onClick={() => handleDifficultyChange(d)}
            className={`seg-btn${difficulty === d ? ' active' : ''}`}
            style={{ textTransform: 'capitalize' }}
          >
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>

      {/* Word display */}
      <div
        className="glass"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          padding: '32px',
          minHeight: '140px',
          borderColor: feedbackBorderColor,
          background: feedbackBg,
          boxShadow: feedbackGlow ? `var(--shadow-card), var(--glass-highlight), ${feedbackGlow}` : undefined,
          transition: 'border-color var(--dur-2) var(--ease-out), background var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out)',
        }}
      >
        <div
          style={{
            fontSize: '56px',
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '4px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {currentWord}
        </div>

        {/* Hint */}
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Press:{' '}
          <span style={{ letterSpacing: '4px', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
            {[...targetLetters].sort().join(' ')}
          </span>
        </div>

        {/* Live chord chips */}
        <div style={{ display: 'flex', gap: '6px', minHeight: '32px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[...currentChord].sort().map((key, i) => (
            <React.Fragment key={key}>
              {i > 0 && (
                <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>+</span>
              )}
              <span
                className="anim-pop"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--accent-grad)',
                  boxShadow: 'var(--accent-glow)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '16px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {key}
              </span>
            </React.Fragment>
          ))}
          {currentChord.size === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '13px', alignSelf: 'center' }}>
              Waiting for chord...
            </span>
          )}
        </div>
      </div>

      {/* Keyboard layout */}
      <KeyboardLayout highlighted={currentChord} />

      {/* Stats bar */}
      <div
        className="glass"
        style={{
          display: 'flex',
          gap: '32px',
          justifyContent: 'center',
          padding: '12px 24px',
        }}
      >
        <StatItem label="Accuracy" value={`${accuracy}%`} />
        <StatItem label="Streak" value={String(stats.streak)} />
        <StatItem label="Correct" value={String(stats.correct)} />
        <StatItem label="Total" value={String(stats.total)} />
      </div>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
        {label}
      </div>
    </div>
  )
}
