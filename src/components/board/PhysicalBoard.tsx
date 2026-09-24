/**
 * PhysicalBoard — renders any PhysicalLayout (key units → pixels) with
 * rotation, non-1u keys, encoders, and a split-gap divider, and delegates
 * labels/colors to the caller. Replaces the per-keyboard geometry code in
 * SplitKeyboard / QMKKeyboard.
 */
import type { CSSProperties, ReactNode } from 'react'
import ScaledBoard from '@/components/ScaledBoard'
import { layoutBounds, type PhysicalLayout } from '@/lib/layout'

export const KEY_UNIT = 46 // px per 1u
export const KEY_GAP = 4 // px between keys
export const KEY_RADIUS = 7
const PAD = 0.2 // key units of margin around the board

export interface KeyVisual {
  label: ReactNode
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
}

function px(u: number): number {
  return u * (KEY_UNIT + KEY_GAP)
}

export default function PhysicalBoard({ layout, keyAt, selected, editable = true, onKeyClick, showDivider = true, maxScale = 1.3 }: Props) {
  const b = layoutBounds(layout)
  const width = px(b.maxX - b.minX + PAD * 2)
  const height = px(b.maxY - b.minY + PAD * 2)

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

  return (
    <ScaledBoard width={width} height={height} maxScale={maxScale}>
      <div className="glass" style={{ position: 'relative', width, height, borderRadius: 16, flexShrink: 0 }}>
        {dividerX !== null && (
          <div style={{
            position: 'absolute', left: dividerX, top: '8%', width: 1, height: '84%',
            background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.10) 20%, rgba(255,255,255,0.10) 80%, transparent)',
            pointerEvents: 'none',
          }} />
        )}
        {layout.keys.map((k, pos) => {
          const w = k.w ?? 1, h = k.h ?? 1
          const v = keyAt(pos)
          const isSelected = selected?.has(pos) ?? false
          const inert = v === null || k.encoder
          const style: CSSProperties = {
            position: 'absolute',
            left: px(k.x - b.minX + PAD),
            top: px(k.y - b.minY + PAD),
            width: w * KEY_UNIT + (w - 1) * KEY_GAP,
            height: h * KEY_UNIT + (h - 1) * KEY_GAP,
            borderRadius: KEY_RADIUS,
            overflow: 'hidden',
            cursor: !inert && editable && onKeyClick ? 'pointer' : 'default',
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
          return (
            <div
              key={pos}
              title={k.encoder ? 'Encoder' : v?.title}
              className={['keycap', isSelected ? 'selected' : '', (v?.dashed || k.encoder) && !isSelected ? 'dashed' : ''].filter(Boolean).join(' ')}
              onClick={(e) => {
                if (inert || !editable) return
                onKeyClick?.(pos, e.currentTarget as HTMLElement)
              }}
              style={style}
            >
              {k.encoder ? '◎' : v?.label}
            </div>
          )
        })}
      </div>
    </ScaledBoard>
  )
}
