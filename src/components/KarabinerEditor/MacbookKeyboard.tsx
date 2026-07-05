import { useState, type CSSProperties } from 'react'
import { MACBOOK_LAYOUT, getKeyStyle, BOARD_WIDTH, BOARD_HEIGHT, type MacKey } from '@/lib/macbookLayout'
import type { Rule } from '@/lib/karabinerGenerator'
import ScaledBoard from '@/components/ScaledBoard'
import MacKeyEditor from './MacKeyEditor'

interface Props {
  rules: Rule[]
  onKeyClick?: (key: MacKey) => void
  selectedKey?: MacKey | null
  /** Keys to highlight in combo-selection colour (set of key codes) */
  selectedKeys?: Set<string>
  /** Keys to highlight for combo preview (hover) */
  comboHighlights?: Set<string>
  /** When true: clicking a key calls onKeyClick without opening the binding editor */
  selectorMode?: boolean
}

export default function MacbookKeyboard({ rules, onKeyClick, selectedKey, selectedKeys, comboHighlights, selectorMode }: Props) {
  const [editing, setEditing] = useState<{ key: MacKey; x: number; y: number } | null>(null)

  // Build set of mapped key codes for highlighting
  const mappedFrom = new Set<string>()
  const mappedTo = new Set<string>()
  for (const rule of rules) {
    switch (rule.type) {
      case 'simple':
        mappedFrom.add(rule.fromKey)
        mappedTo.add(rule.toKey)
        break
      case 'combo':
        rule.fromKeys.forEach(k => mappedFrom.add(k))
        mappedTo.add(rule.toKey)
        break
      case 'layer_activator':
        mappedFrom.add(rule.fromKey)
        break
      case 'layer_binding':
        mappedFrom.add(rule.fromKey)
        mappedTo.add(rule.toKey)
        break
      case 'homerow_mod':
        mappedFrom.add(rule.fromKey)
        mappedTo.add(rule.modKey)
        break
    }
  }

  /** Per-state key colors, injected into .keycap via CSS custom props */
  function getKeyVars(key: MacKey) {
    const code = key.code
    const isComboHighlit  = comboHighlights?.has(code)
    const isMappedFrom    = mappedFrom.has(code)
    const isMappedTo      = mappedTo.has(code)

    if (isComboHighlit) return {
      bg: 'rgba(251,146,60,0.25)',
      border: 'rgba(251,146,60,0.5)',
      text: '#fb923c',
    }
    if (isMappedFrom) return {
      bg: 'rgba(255,69,58,0.18)',
      border: 'rgba(255,69,58,0.4)',
      text: 'var(--danger)',
    }
    if (isMappedTo) return {
      bg: 'rgba(50,215,75,0.15)',
      border: 'rgba(50,215,75,0.35)',
      text: 'var(--success)',
    }
    // Default
    return {
      bg: key.small
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.09)',
      text: 'var(--text-secondary)',
    }
  }

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 11, color: 'var(--text-muted)', paddingLeft: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,69,58,0.4)', display: 'inline-block' }} />
          Remapped from
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(50,215,75,0.35)', display: 'inline-block' }} />
          Remapped to
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} />
          Selected
        </span>
        <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Click any key to configure its binding
        </span>
      </div>

      {/* Keyboard body — scales with its container */}
      <ScaledBoard width={BOARD_WIDTH} height={BOARD_HEIGHT}>
      <div
        className="glass"
        style={{
          position: 'relative',
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          borderRadius: 16,
          padding: 4,
          flexShrink: 0,
        }}
      >
        {MACBOOK_LAYOUT.map(key => {
          const vars = getKeyVars(key)
          const style = getKeyStyle(key)
          const isSelected = selectedKey?.code === key.code || selectedKeys?.has(key.code)
          return (
            <div
              key={key.code}
              className={['keycap', isSelected ? 'selected' : ''].filter(Boolean).join(' ')}
              onClick={(e) => {
                onKeyClick?.(key)
                if (!selectorMode) {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setEditing({ key, x: rect.left, y: rect.bottom + 4 })
                }
              }}
              title={key.code}
              style={{
                ...style,
                ...(isSelected ? {} : {
                  '--key-bg': vars.bg,
                  '--key-border': vars.border,
                  '--key-text': vars.text,
                }),
                fontSize: key.small ? 9 : (key.label.length > 2 ? 10 : 12),
                letterSpacing: key.small ? '0.02em' : 0,
              } as CSSProperties}
            >
              {key.label}
            </div>
          )
        })}
      </div>
      </ScaledBoard>
      {editing && (
        <MacKeyEditor
          macKey={editing.key}
          anchorX={editing.x}
          anchorY={editing.y}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
