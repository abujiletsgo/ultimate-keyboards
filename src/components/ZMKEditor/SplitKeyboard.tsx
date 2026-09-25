import { useState } from 'react'
import type { ZMKLayer } from '@/lib/zmkParser'
import PhysicalBoard, { type KeyVisual } from '@/components/board/PhysicalBoard'
import { LEGACY_CROSSES, type PhysicalLayout } from '@/lib/layout'
import BindingEditor from './BindingEditor'
import { bindingLabel, bindingSubLabel } from '@/lib/keyLabel'
import { BoardLegend } from '@/components/ui'

interface Props {
  layer: ZMKLayer | null
  /** Physical layout to draw; defaults to the legacy 42-key Corne/Crosses geometry. */
  layout?: PhysicalLayout
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



export default function SplitKeyboard({ layer, layout = LEGACY_CROSSES, highlightedPositions, onKeyClick, onBindingChange }: Props) {
  const [editing, setEditing] = useState<{ pos: number; x: number; y: number; top: number } | null>(null)
  const highlighted = highlightedPositions ?? new Set<number>()
  // A keymap whose layers don't have one binding per layout key must be shown
  // read-only, or a click on a phantom key would corrupt it.
  const keyCount = layer?.keys.length ?? layout.keys.length
  const mismatch = keyCount !== layout.keys.length
  const editable = !mismatch

  const keyAt = (pos: number): KeyVisual => {
    const binding = layer?.keys[pos] ?? '&trans'
    const label = bindingLabel(binding)
    const vars = getKeyVars(binding)
    const sub = bindingSubLabel(binding)
    return {
      label, sub, title: binding,
      bg: vars.bg, border: vars.border, text: vars.text, dashed: vars.dashed,
      fontSize: label.length <= 3 ? (sub ? 10 : 11) : label.length <= 5 ? 9 : 8,
    }
  }

  return (
    <div style={{ padding: '16px 0' }}>
      {mismatch && (
        <div className="panel-inset" role="alert" style={{
          padding: '10px 14px', marginBottom: 12, fontSize: 12,
          color: 'var(--warning)', borderColor: 'rgba(251,191,36,0.35)',
        }}>
          Layout mismatch: this keymap has {keyCount} keys per layer but the board layout has {layout.keys.length}.
          Editing is disabled so the file can't be corrupted. Pick a matching layout in Settings.
        </div>
      )}
      {onBindingChange && <BoardLegend />}
      {onKeyClick && !onBindingChange && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, paddingLeft: 4 }}>
          Click a key to configure its position in combos
        </div>
      )}

      <PhysicalBoard
        label="ZMK keymap"
        layout={layout}
        keyAt={keyAt}
        selected={highlighted}
        editable={editable && !!(onKeyClick || onBindingChange)}
        onKeyClick={(pos, el) => {
          onKeyClick?.(pos)
          if (onBindingChange) {
            const rect = el.getBoundingClientRect()
            setEditing({ pos, x: rect.left, y: rect.bottom + 4, top: rect.top - 4 })
          }
        }}
      />
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
