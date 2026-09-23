import { useState, type CSSProperties } from 'react'
import type { ZMKLayer } from '@/lib/zmkParser'
import { CROSSES_LAYOUT, getKeyStyle, BOARD_WIDTH, BOARD_HEIGHT, KEY_UNIT, KEY_GAP } from '@/lib/crossesLayout'
import ScaledBoard from '@/components/ScaledBoard'
import BindingEditor from './BindingEditor'
import { bindingLabel } from '@/lib/keyLabel'

interface Props {
  layer: ZMKLayer | null
  highlightedPositions?: Set<number>
  onKeyClick?: (pos: number) => void
  onBindingChange?: (pos: number, newBinding: string) => void
}

type ZMKBehavior = 'trans' | 'none' | 'layer' | 'toggle' | 'layer-tap' | 'mod-tap' | 'sticky' | 'bluetooth' | 'mouse' | 'caps' | 'normal'

function getZMKBehavior(binding: string): ZMKBehavior {
  if (binding === '&trans') return 'trans'
  if (binding === '&none') return 'none'
  if (binding === '&caps_word') return 'caps'
  if (binding.startsWith('&mo ')) return 'layer'
  if (binding.startsWith('&tog ')) return 'toggle'
  if (binding.startsWith('&lt ')) return 'layer-tap'
  if (binding.startsWith('&mt ')) return 'mod-tap'
  if (binding.startsWith('&sl ') || binding.startsWith('&sk ')) return 'sticky'
  if (binding.startsWith('&bt ')) return 'bluetooth'
  if (binding.startsWith('&mkp ')) return 'mouse'
  return 'normal'
}

/** Per-behavior key colors, injected into .keycap via CSS custom props */
function getKeyVars(binding: string): { bg?: string; border?: string; text?: string; dashed?: boolean } {
  const b = getZMKBehavior(binding)
  switch (b) {
    case 'trans':     return { bg: 'rgba(255,255,255,0.025)', border: 'rgba(255,255,255,0.10)', text: 'rgba(226,230,255,0.25)', dashed: true }
    case 'none':      return { bg: 'rgba(251,113,133,0.05)', border: 'rgba(251,113,133,0.16)', text: 'rgba(251,113,133,0.40)', dashed: true }
    case 'layer':     return { bg: 'linear-gradient(180deg, rgba(96,165,250,0.30), rgba(96,165,250,0.16))', border: 'rgba(96,165,250,0.50)', text: '#bfdbfe' }
    case 'toggle':    return { bg: 'linear-gradient(180deg, rgba(245,158,11,0.26), rgba(245,158,11,0.13))', border: 'rgba(245,158,11,0.45)', text: '#fcd34d' }
    case 'layer-tap': return { bg: 'linear-gradient(180deg, rgba(96,165,250,0.18), rgba(96,165,250,0.08))', border: 'rgba(96,165,250,0.35)', text: '#93c5fd' }
    case 'mod-tap':   return { bg: 'linear-gradient(180deg, rgba(251,146,60,0.20), rgba(251,146,60,0.09))', border: 'rgba(251,146,60,0.40)', text: '#fdba74' }
    case 'sticky':    return { bg: 'linear-gradient(180deg, rgba(251,191,36,0.20), rgba(251,191,36,0.09))', border: 'rgba(251,191,36,0.40)', text: '#fde68a' }
    case 'bluetooth': return { bg: 'linear-gradient(180deg, rgba(34,211,238,0.22), rgba(34,211,238,0.10))', border: 'rgba(34,211,238,0.42)', text: '#a5f3fc' }
    case 'mouse':     return { bg: 'linear-gradient(180deg, rgba(244,114,182,0.20), rgba(244,114,182,0.09))', border: 'rgba(244,114,182,0.40)', text: '#f9a8d4' }
    case 'caps':      return { bg: 'linear-gradient(180deg, rgba(74,222,128,0.20), rgba(74,222,128,0.09))', border: 'rgba(74,222,128,0.40)', text: '#86efac' }
    default:          return {}
  }
}

// Divider x position: centered in the split gap (left ends 6.2u, right starts 6.9u)
const DIVIDER_X = 6.55 * (KEY_UNIT + KEY_GAP)

const LEGEND = [
  { color: 'rgba(96,165,250,0.65)', label: 'Layer' },
  { color: 'rgba(245,158,11,0.60)', label: 'Toggle' },
  { color: 'rgba(251,146,60,0.55)', label: 'Mod-tap' },
  { color: 'rgba(251,191,36,0.55)', label: 'Sticky' },
  { color: 'rgba(34,211,238,0.60)', label: 'BT' },
  { color: 'rgba(244,114,182,0.55)', label: 'Mouse' },
]

export default function SplitKeyboard({ layer, highlightedPositions, onKeyClick, onBindingChange }: Props) {
  const [editing, setEditing] = useState<{ pos: number; x: number; y: number; top: number } | null>(null)
  const highlighted = highlightedPositions ?? new Set<number>()

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Legend */}
      {onBindingChange && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap', paddingLeft: 2 }}>
          {LEGEND.map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 9, height: 9, borderRadius: 3, background: color,
                boxShadow: `0 0 6px ${color}`, display: 'inline-block',
              }} />
              {label}
            </span>
          ))}
        </div>
      )}
      {onKeyClick && !onBindingChange && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, paddingLeft: 4 }}>
          Click a key to configure its position in combos
        </div>
      )}

      {/* Keyboard body — scales with its container */}
      <ScaledBoard width={BOARD_WIDTH} height={BOARD_HEIGHT}>
      <div
        className="glass"
        style={{
          position: 'relative',
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          borderRadius: 16,
          flexShrink: 0,
        }}
      >
        {/* Half divider line */}
        <div style={{
          position: 'absolute',
          left: DIVIDER_X,
          top: '8%',
          width: 1,
          height: '84%',
          background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.10) 20%, rgba(255,255,255,0.10) 80%, transparent)',
          pointerEvents: 'none',
        }} />

        {CROSSES_LAYOUT.map(key => {
          const binding = layer?.keys[key.pos] ?? '&trans'
          const label = bindingLabel(binding)
          const vars = getKeyVars(binding)
          const keyStyle = getKeyStyle(key)
          const isSelected = highlighted.has(key.pos)

          return (
            <div
              key={key.pos}
              title={binding}
              className={[
                'keycap',
                isSelected ? 'selected' : '',
                vars.dashed && !isSelected ? 'dashed' : '',
              ].filter(Boolean).join(' ')}
              onClick={(e) => {
                  onKeyClick?.(key.pos)
                  if (onBindingChange) {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setEditing({ pos: key.pos, x: rect.left, y: rect.bottom + 4, top: rect.top - 4 })
                  }
                }}
              style={{
                ...keyStyle,
                ...(isSelected ? {} : {
                  '--key-bg': vars.bg,
                  '--key-border': vars.border,
                  '--key-text': vars.text,
                }),
                fontSize: label.length <= 3 ? 11 : label.length <= 5 ? 9 : 8,
                cursor: (onKeyClick || onBindingChange) ? 'pointer' : 'default',
                overflow: 'hidden',
              } as CSSProperties}
            >
              {label}
            </div>
          )
        })}
      </div>
      </ScaledBoard>
      {editing !== null && (
        <BindingEditor
          firmware="zmk"
          currentBinding={layer?.keys[editing.pos] ?? '&trans'}
          anchorX={editing.x}
          anchorY={editing.y}
          anchorTop={editing.top}
          onUpdate={(v) => {
            onBindingChange?.(editing.pos, v)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
