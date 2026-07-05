import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'

export interface KeyChoice {
  label: string
  value: string
  description?: string
}

interface Props {
  title: string
  choices: KeyChoice[]
  currentValue?: string
  onSelect: (value: string) => void
  onCancel: () => void
  anchorX?: number   // screen x of anchor (left edge of key)
  anchorY?: number   // screen y of anchor (bottom edge of key for below, top for above)
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[_&\s()\[\]]+/g, '')
}

function fuzzyMatch(query: string, item: KeyChoice): boolean {
  if (!query) return true
  const q = normalize(query)
  const l = normalize(item.label)
  const v = normalize(item.value)
  const d = normalize(item.description ?? '')
  if (l.includes(q) || v.includes(q) || d.includes(q)) return true
  // character subsequence match for short queries
  if (q.length >= 2 && q.length <= 4) {
    return q.split('').every(c => l.includes(c))
  }
  return false
}

export default function KeyPicker({
  title, choices, currentValue,
  onSelect, onCancel,
  anchorX, anchorY,
}: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const isPopover = anchorX !== undefined && anchorY !== undefined

  const filtered = useMemo(() => {
    const results = choices.filter(c => fuzzyMatch(query, c))
    if (currentValue && !query) {
      const curIdx = results.findIndex(r => r.value === currentValue)
      if (curIdx > 0) {
        const cur = results.splice(curIdx, 1)
        results.unshift(cur[0])
      }
    }
    return results
  }, [query, choices, currentValue])

  useEffect(() => { setActiveIdx(0) }, [query])
  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) onSelect(filtered[activeIdx].value) }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }, [filtered, activeIdx, onSelect, onCancel])

  // Compute popover position
  const getPopoverStyle = (): React.CSSProperties => {
    if (!isPopover) return {}
    const W = 320
    const MARGIN = 8
    const DIALOG_H = 340 // approximate max height

    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = anchorX!
    if (left + W > vw - MARGIN) left = vw - W - MARGIN
    if (left < MARGIN) left = MARGIN

    // Prefer below anchor; if not enough space, go above
    const showAbove = anchorY! + DIALOG_H > vh - MARGIN
    const top = showAbove
      ? (anchorY! - DIALOG_H - 8)
      : anchorY!

    return {
      position: 'fixed',
      left,
      top: Math.max(MARGIN, top),
      zIndex: 1001,
    }
  }

  const dialogContent = (
    <div
      ref={dialogRef}
      className="glass-strong anim-scale-in"
      style={{
        width: 320,
        maxHeight: 340,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onClick={e => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {title}
        </div>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search…"
          style={{ width: '100%', fontSize: 12, boxSizing: 'border-box' }}
        />
      </div>

      {/* Results */}
      <ul ref={listRef} style={{ margin: 0, padding: '3px 0', overflowY: 'auto', flex: 1, listStyle: 'none' }}>
        {filtered.length === 0 && (
          <li style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)' }}>
            No results
          </li>
        )}
        {filtered.map((choice, i) => {
          const isActive = i === activeIdx
          const isCurrent = choice.value === currentValue
          return (
            <li
              key={choice.value + i}
              data-idx={i}
              onClick={() => onSelect(choice.value)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: '5px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'baseline', gap: 7,
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                borderLeft: isCurrent ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'background var(--dur-1) var(--ease-out)',
              }}
            >
              <code className="mono" style={{ flexShrink: 0, color: isActive ? 'var(--accent-hover)' : 'var(--text-secondary)' }}>
                {choice.label}
              </code>
              {choice.description && (
                <span style={{ fontSize: 10, color: isActive ? 'var(--text)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {choice.description}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {/* Footer */}
      <div style={{ padding: '5px 12px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
        <span>↑↓</span><span>↵ select</span><span>Esc</span>
        <span style={{ marginLeft: 'auto' }}>{filtered.length}/{choices.length}</span>
      </div>
    </div>
  )

  if (isPopover) {
    return (
      <>
        {/* Invisible backdrop to catch outside clicks */}
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
          onClick={onCancel}
        />
        <div style={getPopoverStyle()}>
          {dialogContent}
        </div>
      </>
    )
  }

  // Fallback: centered modal
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      {dialogContent}
    </div>
  )
}
