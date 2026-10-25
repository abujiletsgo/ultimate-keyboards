import { useState } from 'react'
import type { ZMKLayer } from '@/lib/zmkParser'
import PhysicalBoard, { type KeyVisual } from '@/components/board/PhysicalBoard'
import { LEGACY_CROSSES, type PhysicalLayout } from '@/lib/layout'
import BindingEditor from './BindingEditor'
import { bindingLabel, bindingSubLabel } from '@/lib/keyLabel'
import { getZMKBehavior, semanticKeyVisual } from '@/lib/keyVisual'
import { BoardLegend } from '@/components/ui'

interface Props {
  layer: ZMKLayer | null
  /** Physical layout to draw; defaults to the legacy 42-key Corne/Crosses geometry. */
  layout?: PhysicalLayout
  highlightedPositions?: Set<number>
  onKeyClick?: (pos: number) => void
  onBindingChange?: (pos: number, newBinding: string) => void
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
    return semanticKeyVisual(getZMKBehavior(binding), label, bindingSubLabel(binding), binding)
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
