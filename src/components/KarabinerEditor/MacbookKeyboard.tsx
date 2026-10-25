import { useState, type CSSProperties } from 'react'
import { MACBOOK_LAYOUT, getKeyStyle, BOARD_WIDTH, BOARD_HEIGHT, type MacKey } from '@/lib/macbookLayout'
import type { Rule } from '@/lib/karabinerGenerator'
import ScaledBoard from '@/components/ScaledBoard'
import PhysicalBoard from '@/components/board/PhysicalBoard'
import { MAC_PHYSICAL_LAYOUT, macKeyFace } from '@/lib/macKeymapView'
import { BoardLegend } from '@/components/ui'
import { Fingerprint } from 'lucide-react'
import MacBindingEditor from './MacBindingEditor'
import { semanticKeyVisual, type KeyBehavior } from '@/lib/keyVisual'
import './MacbookKeyboard.css'

interface Props {
  rules: Rule[]
  selectedLayer?: string | null
  onKeyClick?: (key: MacKey) => void
  selectedKey?: MacKey | null
  /** Keys to highlight in combo-selection colour (set of key codes) */
  selectedKeys?: Set<string>
  /** Keys to highlight for combo preview (hover) */
  comboHighlights?: Set<string>
  /** Solid combo colours for each trigger; shared keys may have multiple colours. */
  comboColors?: Map<string, string[]>
  comboHighlightColor?: string
  /** When true: clicking a key calls onKeyClick without opening the binding editor */
  selectorMode?: boolean
}

export default function MacbookKeyboard({ rules, onKeyClick, selectedKey, selectedKeys, comboHighlights, comboColors, comboHighlightColor, selectorMode, selectedLayer = null }: Props) {
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

  const isPreview = selectorMode && !onKeyClick

  function getKeyVars(key: MacKey) {
    const highlighted = comboHighlights?.has(key.code)
    const colors = highlighted ? [comboHighlightColor ?? '#fb923c']
      : comboHighlights ? [] : comboColors?.get(key.code) ?? []
    if (colors.length) {
      const fill = colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.flatMap((color, i) => [
        `${color} ${i * 100 / colors.length}%`, `${color} ${(i + 1) * 100 / colors.length}%`,
      ]).join(', ')})`
      return { bg: fill, border: highlighted ? '#ffffff' : colors[0], text: '#101827' }
    }
    if (!selectorMode && changed.has(key.code)) return { bg: '#173f40', border: '#2dd4bf', text: '#f4fffc' }
    return { bg: '#293343', border: '#65748b', text: '#f1f5f9' }
  }

  if (!selectorMode) return (
    <div className="mac-keymap-board macbook-keyboard">
      <BoardLegend items={[
        { color: 'rgba(255,255,255,0.3)', label: 'Key' }, { color: '#60a5fa', label: 'Layer' },
        { color: '#fb923c', label: 'Mod-tap' }, { color: 'rgba(255,255,255,0.15)', label: 'Pass-through' },
        { color: '#fbbf24', label: 'Rule-order conflict' },
      ]} />
      <PhysicalBoard layout={MAC_PHYSICAL_LAYOUT} label="MacBook keyboard" showDivider={false}
        keyAt={position => {
          const key = MACBOOK_LAYOUT[position]
          const face = macKeyFace(rules, key, selectedLayer)
          if (key.code === 'power') return { ...semanticKeyVisual('normal', '', undefined, 'power: Touch ID is system controlled'), label: <Fingerprint size={14} aria-hidden="true" /> }
          const behavior: KeyBehavior = face.kind === 'layer' ? 'layer' : face.kind === 'layer-tap' ? 'layer-tap'
            : face.kind === 'homerow' ? 'mod-tap' : face.kind === 'fallback' ? 'trans' : 'normal'
          return semanticKeyVisual(behavior, face.label, key.small || (key.h ?? 1) < 1 ? undefined : face.sub,
            `${key.code}: ${face.detail}; output ${face.label}`)
        }}
        onKeyClick={(position, element) => {
          const key = MACBOOK_LAYOUT[position]
          onKeyClick?.(key)
          const rect = element.getBoundingClientRect()
          setEditing({ key, x: rect.left, y: rect.bottom + 4, top: rect.top - 4 })
        }} />
      {editing && <MacBindingEditor keyCode={editing.key.code} layerName={selectedLayer}
        anchorX={editing.x} anchorY={editing.y} anchorTop={editing.top} onClose={() => setEditing(null)} />}
    </div>
  )

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
        className="glass macbook-keyboard"
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
              aria-label={`${key.label || key.code}${changed.has(key.code) ? `, ${changed.get(key.code)}` : ''}${comboColors?.has(key.code) ? `, trigger in ${comboColors.get(key.code)!.length} combo${comboColors.get(key.code)!.length === 1 ? '' : 's'}` : ''}`}
              data-combo-trigger={comboColors?.has(key.code) || undefined}
              data-combo-active={comboHighlights?.has(key.code) || undefined}
              aria-pressed={isSelected}
              className={['keycap', isSelected ? 'selected' : '', isPreview ? 'mac-key-preview' : ''].filter(Boolean).join(' ')}
              disabled={isPreview}
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
        <MacBindingEditor
          keyCode={editing.key.code}
          layerName={selectedLayer}
          anchorX={editing.x}
          anchorY={editing.y}
          anchorTop={editing.top}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
