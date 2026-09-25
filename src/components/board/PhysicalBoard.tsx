/**
 * PhysicalBoard — renders any PhysicalLayout (key units → pixels) with
 * rotation, non-1u keys, encoders and a split-gap divider, and delegates
 * labels/colors to the caller.
 *
 * Every key is a real <button>: one tab stop for the whole board (roving
 * tabindex), arrow keys move between keys by geometry, Enter/Space activates,
 * and each key carries an accessible name (binding + sub-label).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import ScaledBoard from '@/components/ScaledBoard'
import { layoutBounds, type PhysicalLayout } from '@/lib/layout'

export const KEY_UNIT = 46 // px per 1u
export const KEY_GAP = 4 // px between keys
export const KEY_RADIUS = 7
const PAD = 0.2 // key units of margin around the board

export interface KeyVisual {
  label: ReactNode
  /** small line under the label naming the behavior (e.g. "HOLD L1", "MOD-TAP") */
  sub?: string
  /** Hover tooltip (usually the raw binding) */
  title?: string
  bg?: string
  border?: string
  text?: string
  dashed?: boolean
  /** Font size override in px */
  fontSize?: number
}

interface Props {
  layout: PhysicalLayout
  /** Visual for key at position i; return null to render an inert slot. */
  keyAt: (pos: number) => KeyVisual | null
  selected?: Set<number>
  editable?: boolean
  onKeyClick?: (pos: number, el: HTMLElement) => void
  /** Draw a vertical divider between hands when the layout has a hand split. */
  showDivider?: boolean
  maxScale?: number
  /** Accessible name for the board */
  label?: string
}

function px(u: number): number {
  return u * (KEY_UNIT + KEY_GAP)
}

export default function PhysicalBoard({ layout, keyAt, selected, editable = true, onKeyClick, showDivider = true, maxScale = 1.3, label = 'Keyboard' }: Props) {
  const b = layoutBounds(layout)
  const width = px(b.maxX - b.minX + PAD * 2)
  const height = px(b.maxY - b.minY + PAD * 2)
  const [focusPos, setFocusPos] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const interactive = editable && !!onKeyClick

  useEffect(() => { refs.current = refs.current.slice(0, layout.keys.length) }, [layout.keys.length])

  // Divider: midpoint of the largest horizontal gap between left- and right-hand keys.
  let dividerX: number | null = null
  if (showDivider) {
    const left = layout.keys.filter(k => k.hand === 'L')
    const right = layout.keys.filter(k => k.hand === 'R')
    if (left.length && right.length) {
      const leftEdge = Math.max(...left.map(k => k.x + (k.w ?? 1)))
      const rightEdge = Math.min(...right.map(k => k.x))
      if (rightEdge > leftEdge) dividerX = px((leftEdge + rightEdge) / 2 - b.minX + PAD)
    }
  }

  /** Nearest key in a direction, by center distance with a directional bias. */
  const move = useCallback((from: number, dir: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): number => {
    const c = (i: number) => { const k = layout.keys[i]; return { x: k.x + (k.w ?? 1) / 2, y: k.y + (k.h ?? 1) / 2 } }
    const o = c(from)
    let best = -1, bestScore = Infinity
    layout.keys.forEach((k, i) => {
      if (i === from || k.encoder || k.hidden) return
      const p = c(i)
      const dx = p.x - o.x, dy = p.y - o.y
      const ok = dir === 'ArrowLeft' ? dx < -0.3 : dir === 'ArrowRight' ? dx > 0.3 : dir === 'ArrowUp' ? dy < -0.3 : dy > 0.3
      if (!ok) return
      const along = dir === 'ArrowLeft' || dir === 'ArrowRight' ? Math.abs(dx) : Math.abs(dy)
      const across = dir === 'ArrowLeft' || dir === 'ArrowRight' ? Math.abs(dy) : Math.abs(dx)
      const score = along + across * 2.5
      if (score < bestScore) { bestScore = score; best = i }
    })
    return best
  }, [layout.keys])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, pos: number) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = move(pos, e.key)
      if (next >= 0) { setFocusPos(next); refs.current[next]?.focus() }
    } else if (e.key === 'Home') { e.preventDefault(); setFocusPos(0); refs.current[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); const n = layout.keys.length - 1; setFocusPos(n); refs.current[n]?.focus() }
  }

  return (
    <ScaledBoard width={width} height={height} maxScale={maxScale}>
      <div className="glass" role="group" aria-label={label} style={{ position: 'relative', width, height, borderRadius: 16, flexShrink: 0 }}>
        {dividerX !== null && (
          <div aria-hidden style={{
            position: 'absolute', left: dividerX, top: '8%', width: 1, height: '84%',
            background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.10) 20%, rgba(255,255,255,0.10) 80%, transparent)',
            pointerEvents: 'none',
          }} />
        )}
        {layout.keys.map((k, pos) => {
          if (k.hidden) return null
          const w = k.w ?? 1, h = k.h ?? 1
          const v = keyAt(pos)
          const isSelected = selected?.has(pos) ?? false
          const inert = v === null || !!k.encoder
          const style: CSSProperties = {
            position: 'absolute',
            left: px(k.x - b.minX + PAD),
            top: px(k.y - b.minY + PAD),
            width: w * KEY_UNIT + (w - 1) * KEY_GAP,
            height: h * KEY_UNIT + (h - 1) * KEY_GAP,
            borderRadius: KEY_RADIUS,
            overflow: 'hidden',
            cursor: !inert && interactive ? 'pointer' : 'default',
            fontSize: v?.fontSize ?? 11,
            ...(k.r ? {
              transform: `rotate(${k.r}deg)`,
              transformOrigin: `${px((k.rx ?? k.x) - k.x)}px ${px((k.ry ?? k.y) - k.y)}px`,
            } : {}),
            ...(isSelected ? {} : {
              '--key-bg': v?.bg,
              '--key-border': v?.border,
              '--key-text': v?.text,
            } as CSSProperties),
          }
          const name = k.encoder ? `Encoder ${pos}` : `Key ${pos}: ${v?.title ?? ''}${v?.sub ? ` (${v.sub})` : ''}`
          return (
            <button
              key={pos}
              type="button"
              ref={el => { refs.current[pos] = el }}
              tabIndex={interactive && !inert ? (pos === focusPos ? 0 : -1) : -1}
              disabled={inert}
              aria-label={name}
              aria-pressed={selected ? isSelected : undefined}
              title={k.encoder ? 'Encoder' : v?.title}
              className={['keycap', isSelected ? 'selected' : '', (v?.dashed || k.encoder) && !isSelected ? 'dashed' : ''].filter(Boolean).join(' ')}
              onFocus={() => setFocusPos(pos)}
              onKeyDown={e => onKeyDown(e, pos)}
              onClick={(e) => {
                if (inert || !interactive) return
                setFocusPos(pos)
                onKeyClick?.(pos, e.currentTarget)
              }}
              style={style}
            >
              <span className="key-main">{k.encoder ? '◎' : v?.label}</span>
              {v?.sub && !k.encoder && <span className="key-sub" aria-hidden>{v.sub}</span>}
            </button>
          )
        })}
      </div>
    </ScaledBoard>
  )
}
