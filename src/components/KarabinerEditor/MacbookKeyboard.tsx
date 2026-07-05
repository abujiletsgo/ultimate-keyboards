import { useState } from 'react'
import { MACBOOK_LAYOUT, getKeyStyle, BOARD_WIDTH, BOARD_HEIGHT, type MacKey } from '@/lib/macbookLayout'
import type { Rule } from '@/lib/karabinerGenerator'
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
  const [hovered, setHovered] = useState<string | null>(null)
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

  function getKeyColors(key: MacKey) {
    const code = key.code
    const isSelected      = selectedKey?.code === code || selectedKeys?.has(code)
    const isHovered       = hovered === code
    const isComboHighlit  = comboHighlights?.has(code)
    const isMappedFrom    = mappedFrom.has(code)
    const isMappedTo      = mappedTo.has(code)

    if (isSelected) return {
      bg: 'var(--accent)',
      border: 'rgba(255,255,255,0.3)',
      text: '#fff',
      shadow: '0 0 0 2px var(--accent), 0 2px 8px rgba(124,106,255,0.5)',
    }
    if (isComboHighlit) return {
      bg: 'rgba(251,146,60,0.25)',
      border: 'rgba(251,146,60,0.5)',
      text: '#fb923c',
      shadow: '0 0 0 1px rgba(251,146,60,0.35)',
    }
    if (isHovered) return {
      bg: 'rgba(255,255,255,0.14)',
      border: 'rgba(255,255,255,0.18)',
      text: 'var(--text)',
      shadow: '0 2px 6px rgba(0,0,0,0.4)',
    }
    if (isMappedFrom) return {
      bg: 'rgba(255,69,58,0.18)',
      border: 'rgba(255,69,58,0.4)',
      text: 'var(--danger)',
      shadow: '0 0 0 1px rgba(255,69,58,0.3)',
    }
    if (isMappedTo) return {
      bg: 'rgba(50,215,75,0.15)',
      border: 'rgba(50,215,75,0.35)',
      text: 'var(--success)',
      shadow: '0 0 0 1px rgba(50,215,75,0.25)',
    }
    // Default
    return {
      bg: key.small
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.09)',
      text: 'var(--text-secondary)',
      shadow: '0 1px 3px rgba(0,0,0,0.35), 0 0 0 .5px rgba(255,255,255,0.07)',
    }
  }

  return (
    <div style={{ overflowX: 'auto', padding: '24px 0' }}>
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

      {/* Keyboard body */}
      <div style={{
        position: 'relative',
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        border: '.5px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 .5px rgba(255,255,255,0.06)',
        padding: 4,
        flexShrink: 0,
      }}>
        {MACBOOK_LAYOUT.map(key => {
          const colors = getKeyColors(key)
          const style = getKeyStyle(key)
          return (
            <div
              key={key.code}
              onClick={(e) => {
                onKeyClick?.(key)
                if (!selectorMode) {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setEditing({ key, x: rect.left, y: rect.bottom + 4 })
                }
              }}
              onMouseEnter={() => setHovered(key.code)}
              onMouseLeave={() => setHovered(null)}
              title={key.code}
              style={{
                ...style,
                background: colors.bg,
                boxShadow: colors.shadow,
                border: `.5px solid ${colors.border}`,
                color: colors.text,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: key.small ? 9 : (key.label.length > 2 ? 10 : 12),
                fontWeight: 500,
                fontFamily: '-apple-system, sans-serif',
                userSelect: 'none',
                transition: 'background 0.1s, box-shadow 0.1s, color 0.1s',
                letterSpacing: key.small ? '0.02em' : 0,
              }}
            >
              {key.label}
            </div>
          )
        })}
      </div>
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
