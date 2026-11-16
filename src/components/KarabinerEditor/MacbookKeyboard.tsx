import { useState, type CSSProperties } from 'react'
import { LAPTOP_LAYOUT, getKeyStyle, boardSize, type MacKey } from '@/lib/macbookLayout'
import { hostTerms, isWindows, modifierName, modifierPrefix } from '@/lib/platform'
import type { Rule } from '@/lib/karabinerGenerator'
import ScaledBoard from '@/components/ScaledBoard'
import PhysicalBoard from '@/components/board/PhysicalBoard'
import { LAPTOP_PHYSICAL_LAYOUT, macKeyFace } from '@/lib/macKeymapView'
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
  /** Selector mode: a small second line on these keys (e.g. the modifier a held key sends). */
  keyBadges?: Map<string, string>
  /** Selector mode: only these keys can be clicked; the rest are shown as a static picture. */
  clickableKeys?: Set<string>
}

export default function MacbookKeyboard({ rules, onKeyClick, selectedKey, selectedKeys, comboHighlights, comboColors, comboHighlightColor, selectorMode, selectedLayer = null, keyBadges, clickableKeys }: Props) {
  const [editing, setEditing] = useState<{ key: MacKey; x: number; y: number; top: number } | null>(null)

  // What each key does now, for the ones the rules change (tap output / hold output).
  const { laptopKeyboard } = hostTerms()
  const { width: BOARD_WIDTH, height: BOARD_HEIGHT } = boardSize(LAPTOP_LAYOUT)
  const labelOf = (code: string) => LAPTOP_LAYOUT.find(k => k.code === code)?.label || code.replace(/_/g, ' ')
  const modsOf = (mods?: string[]) => modifierPrefix(mods)
  const changed = new Map<string, string>()
  for (const rule of rules) {
    switch (rule.type) {
      case 'simple': changed.set(rule.fromKey, `→ ${modsOf(rule.toModifiers)}${labelOf(rule.toKey)}`); break
      case 'layer_activator': changed.set(rule.fromKey, `hold: ${rule.layerName}`); break
      // Windows words (Ctrl, Shift) don't fit after 'hold'; the mod-tap colour already says hold.
      case 'homerow_mod': changed.set(rule.fromKey, isWindows() ? modifierName(rule.modKey) : `hold ${modifierName(rule.modKey)}`); break
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
    if (!selectorMode && changed.has(key.code)) return { bg: undefined, border: '#f2a35e', text: undefined }
    return { bg: undefined, border: undefined, text: undefined }
  }

  if (!selectorMode) return (
    <div className="mac-keymap-board macbook-keyboard">
      <BoardLegend items={[
        { color: 'rgba(255,255,255,0.3)', label: 'Key' }, { color: '#5fc8ec', label: 'Layer' },
        { color: '#f2a35e', label: 'Mod-tap' }, { color: '#a48cf5', label: 'Combo' }, { color: 'rgba(255,255,255,0.15)', label: 'Pass-through' },
        { color: '#fbbf24', label: 'Rule-order conflict' },
      ]} />
      <PhysicalBoard layout={LAPTOP_PHYSICAL_LAYOUT} label={laptopKeyboard.replace(/^./, c => c.toUpperCase())} showDivider={false}
        keyAt={position => {
          const key = LAPTOP_LAYOUT[position]
          const face = macKeyFace(rules, key, selectedLayer)
          if (key.code === 'power') return { ...semanticKeyVisual('normal', '', undefined, 'power: Touch ID is system controlled'), label: <Fingerprint size={14} aria-hidden="true" /> }
          if (key.fixed) return semanticKeyVisual('normal', key.label, undefined, `${key.label}: ${key.fixed}`)
          const behavior: KeyBehavior = face.kind === 'layer' ? 'layer' : face.kind === 'layer-tap' ? 'layer-tap'
            : face.kind === 'homerow' ? 'mod-tap' : face.kind === 'fallback' ? 'trans' : face.sub === 'Combo' ? 'combo' : 'normal'
          return semanticKeyVisual(behavior, face.label, key.small || (key.h ?? 1) < 1 ? undefined : face.sub,
            `${key.code}: ${face.detail}; output ${face.label}`)
        }}
        onKeyClick={(position, element) => {
          const key = LAPTOP_LAYOUT[position]
          if (key.fixed) return
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
        aria-label={laptopKeyboard.replace(/^./, c => c.toUpperCase())}
        style={{
          position: 'relative',
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          borderRadius: 16,
          padding: 4,
          flexShrink: 0,
        }}
      >
        {LAPTOP_LAYOUT.map(key => {
          const vars = getKeyVars(key)
          const style = getKeyStyle(key)
          const isSelected = selectedKey?.code === key.code || selectedKeys?.has(key.code)
          const isStatic = isPreview || !!key.fixed || (clickableKeys !== undefined && !clickableKeys.has(key.code))
          const badge = keyBadges?.get(key.code)
          return (
            <button
              type="button"
              key={key.code}
              aria-label={`${key.label || key.code}${badge ? `, hold ${badge}` : ''}${changed.has(key.code) ? `, ${changed.get(key.code)}` : ''}${comboColors?.has(key.code) ? `, trigger in ${comboColors.get(key.code)!.length} combo${comboColors.get(key.code)!.length === 1 ? '' : 's'}` : ''}`}
              data-combo-trigger={comboColors?.has(key.code) || undefined}
              data-combo-active={comboHighlights?.has(key.code) || undefined}
              aria-pressed={isSelected}
              className={['keycap', isSelected ? 'selected' : '', isStatic ? 'mac-key-preview' : ''].filter(Boolean).join(' ')}
              disabled={isStatic}
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
              {badge && <span className="key-sub key-badge">{badge}</span>}
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
