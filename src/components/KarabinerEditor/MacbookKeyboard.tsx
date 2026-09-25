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
  const [editing, setEditing] = useState<{ key: MacKey; x: number; y: number; top: number } | null>(null)

  // What each key does now, for the ones the rules change (tap output / hold output).
  const MOD_SYM: Record<string, string> = { command: '⌘', option: '⌥', control: '⌃', shift: '⇧', fn: 'fn' }
  const labelOf = (code: string) => MACBOOK_LAYOUT.find(k => k.code === code)?.label || code.replace(/_/g, ' ')
  const modsOf = (mods?: string[]) => (mods ?? []).map(m => MOD_SYM[m.replace(/^(left|right)_/, '')] ?? m).join('')
  const changed = new Map<string, string>()
  for (const rule of rules) {
    switch (rule.type) {
      case 'simple': changed.set(rule.fromKey, `→ ${modsOf(rule.toModifiers)}${labelOf(rule.toKey)}`); break
      case 'layer_activator': changed.set(rule.fromKey, `hold: ${rule.layerName}`); break
      case 'homerow_mod': changed.set(rule.fromKey, `hold ${MOD_SYM[rule.modKey.replace(/^(left|right)_/, '')] ?? rule.modKey}`); break
      default: break // combos and layer keys are shown in their own tabs
    }
  }

  function getKeyVars(key: MacKey) {
    if (comboHighlights?.has(key.code)) return { bg: 'rgba(251,146,60,0.25)', border: 'rgba(251,146,60,0.5)', text: '#fb923c' }
    if (!selectorMode && changed.has(key.code)) return { bg: 'rgba(45,212,191,0.14)', border: 'rgba(45,212,191,0.45)', text: 'var(--text)' }
    return { bg: key.small ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.09)', text: 'var(--text-secondary)' }
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {!selectorMode && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: 'var(--text-muted)', paddingLeft: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(45,212,191,0.45)', display: 'inline-block' }} />
            Changed ({changed.size})
          </span>
          <span style={{ marginLeft: 'auto' }}>Click a key to change what it does</span>
        </div>
      )}

      {/* Keyboard body — scales with its container */}
      <ScaledBoard width={BOARD_WIDTH} height={BOARD_HEIGHT}>
      <div
        className="glass"
        role="group"
        aria-label="MacBook keyboard"
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
            <button
              type="button"
              key={key.code}
              aria-label={`${key.label || key.code}${changed.has(key.code) ? `, ${changed.get(key.code)}` : ''}`}
              aria-pressed={isSelected}
              className={['keycap', isSelected ? 'selected' : ''].filter(Boolean).join(' ')}
              disabled={selectorMode && !onKeyClick}
              onClick={(e) => {
                onKeyClick?.(key)
                if (!selectorMode) {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setEditing({ key, x: rect.left, y: rect.bottom + 4, top: rect.top - 4 })
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
              <span className="key-main">{key.label}</span>
              {!selectorMode && changed.has(key.code) && <span className="key-sub" style={{ color: 'var(--accent)', opacity: 1, textTransform: 'none' }}>{changed.get(key.code)}</span>}
            </button>
          )
        })}
      </div>
      </ScaledBoard>
      {editing && (
        <MacKeyEditor
          macKey={editing.key}
          anchorX={editing.x}
          anchorY={editing.y}
          anchorTop={editing.top}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
