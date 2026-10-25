import { ConfirmBanner } from '@/components/ui'
import React, { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { type ComboRule } from '@/lib/karabinerGenerator'
import type { MacKey } from '@/lib/macbookLayout'
import BindingParamPicker from '@/components/board/BindingParamPicker'
import { NATIVE_KEYS, NATIVE_KEY_CHOICES, NATIVE_MODIFIERS, nativeKeyChoice, selectNativeKeyChoice, type NativeBinding } from '@/lib/nativeBinding'
import MacbookKeyboard from './MacbookKeyboard'

const COMBO_COLORS = [
  '#60a5fa',
  '#34d399',
  '#fb923c',
  '#38bdf8',
  '#f472b6',
  '#f59e0b',
  '#f87171',
  '#a7f3d0',
]

const KEY_LABELS: Record<string, string> = {
  return_or_enter: 'Enter', delete_or_backspace: '⌫', escape: 'Esc',
  spacebar: 'Space', caps_lock: 'Caps', left_shift: '⇧L', right_shift: '⇧R',
  left_control: '⌃L', right_control: '⌃R', left_option: '⌥L', right_option: '⌥R',
  left_command: '⌘L', right_command: '⌘R', up_arrow: '↑', down_arrow: '↓',
  left_arrow: '←', right_arrow: '→', grave_accent_and_tilde: '`~',
  hyphen: '-', equal_sign: '=', open_bracket: '[', close_bracket: ']',
  backslash: '\\', semicolon: ';', quote: "'", comma: ',', period: '.', slash: '/',
}

function displayKey(k: string) { return KEY_LABELS[k] ?? k }

// ── Add / Edit form ────────────────────────────────────────────────────────────

interface FormProps {
  editing?: ComboRule
  onSave: (rule: ComboRule) => void
  onCancel: () => void
}

function ComboForm({ editing, onSave, onCancel }: FormProps) {
  const { rules } = useKarabinerStore()
  const [fromKeys, setFromKeys] = useState<string[]>(editing?.fromKeys ?? [])
  const [toKey, setToKey] = useState(editing?.toKey ?? 'escape')
  const [toMods, setToMods] = useState<string[]>(editing?.toModifiers ?? [])
  const [error, setError] = useState('')

  const output: NativeBinding = { behavior: 'key', key: toKey, modifiers: toMods, layer: '', modifier: 'left_shift', holdBehavior: 'balanced' }
  const selectedKeys = useMemo(() => new Set(fromKeys), [fromKeys])

  const toggleKey = (key: MacKey) => {
    const code = key.code
    if (!NATIVE_KEYS.includes(code) && !fromKeys.includes(code)) { setError('Fn and Touch ID cannot be combo triggers in native remapping.'); return }
    setError('')
    setFromKeys(prev =>
      prev.includes(code) ? prev.filter(k => k !== code) : [...prev, code]
    )
  }

  const toggleMod = (mod: string) =>
    setToMods(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])

  const handleSave = () => {
    if (fromKeys.length < 2) { setError('Select at least 2 keys on the keyboard below'); return }
    if (fromKeys.some(key => !NATIVE_KEYS.includes(key))) { setError('Remove unsupported trigger keys before saving this native combo.'); return }
    if (!NATIVE_KEYS.includes(toKey) || toMods.some(mod => !NATIVE_MODIFIERS.includes(mod))) { setError('Choose a supported native output key and modifiers.'); return }
    const desc = `${fromKeys.join('+')} → ${toMods.length ? toMods.join('+')+'+' : ''}${toKey}`
    onSave({
      ...editing,
      type: 'combo',
      description: desc,
      fromKeys,
      toKey: toKey.trim(),
      toModifiers: toMods.length > 0 ? toMods : undefined,
    })
  }

  return (
    <div className="glass-strong anim-scale-in" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
        {editing ? 'Edit Combo' : 'Add Combo'}
      </div>

      {/* Output key */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Output key</span>
        <BindingParamPicker options={NATIVE_KEY_CHOICES} value={nativeKeyChoice(output)} label="Combo output key" allowCustom={false}
          hint="US ANSI symbols include Shift. Choose the symbol’s raw base key to remove Shift."
          onChange={choice => { const selected = selectNativeKeyChoice(output, choice); setToKey(selected.key); setToMods(selected.modifiers); setError('') }} />
      </div>

      {/* Modifiers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Output modifiers (optional)</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[...new Set(['command', 'option', 'control', 'shift', ...toMods])].map(mod => {
            const active = toMods.includes(mod)
            const sym: Record<string, string> = { command: '⌘', option: '⌥', control: '⌃', shift: '⇧', fn: 'fn' }
            return (
              <button key={mod} aria-label={mod.replace(/_/g, ' ')} aria-pressed={active} onClick={() => toggleMod(mod)} style={{
                padding: '3px 8px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                background: active ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.06)',
                border: active ? '1px solid rgba(45,212,191,0.6)' : '1px solid rgba(255,255,255,0.1)',
                color: active ? 'var(--accent-hover)' : 'var(--text-muted)',
                transition: 'background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out)',
              }}>{sym[mod] ?? mod}</button>
            )
          })}
        </div>
      </div>

      {/* Trigger keys summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          Trigger keys — click keys on keyboard ({fromKeys.length} selected, need ≥ 2)
        </span>
        {fromKeys.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {fromKeys.map(kc => (
              <span key={kc} style={{
                fontSize: 11, background: 'var(--accent-grad)', color: '#fff',
                borderRadius: 4, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--font-mono)',
              }}>
                {displayKey(kc)}
                <span style={{ cursor: 'pointer', opacity: 0.7 }}
                  onClick={() => setFromKeys(prev => prev.filter(k => k !== kc))}>×</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Keyboard picker */}
      <div className="panel-inset" style={{ padding: '8px 12px', overflowX: 'auto' }}>
        <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 6 }}>
          Click keys to add/remove from trigger — highlighted = selected
        </div>
        <MacbookKeyboard
          rules={rules}
          selectorMode
          selectedKeys={selectedKeys}
          onKeyClick={toggleKey}
        />
      </div>

      {error && <div role="alert" style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave}>{editing ? 'Save Changes' : 'Add Combo'}</button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

const MacComboEditor: React.FC = () => {
  const { rules, addRule, removeRule, updateRule } = useKarabinerStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<{ combo: ComboRule; idx: number } | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)

  const combos = rules
    .map((r, i) => ({ rule: r, idx: i }))
    .filter(({ rule }) => rule.type === 'combo') as { rule: ComboRule; idx: number }[]

  const activeIdx = focusedIdx ?? hoveredIdx
  const activeComboIndex = combos.findIndex(c => c.idx === activeIdx)
  const hoveredCombo = activeComboIndex >= 0 ? combos[activeComboIndex].rule : null
  const activeColor = COMBO_COLORS[Math.max(0, activeComboIndex) % COMBO_COLORS.length]
  const comboColors = new Map<string, string[]>()
  combos.forEach(({ rule }, index) => {
    const color = COMBO_COLORS[index % COMBO_COLORS.length]
    rule.fromKeys.forEach(code => comboColors.set(code, [...(comboColors.get(code) ?? []), color]))
  })
  const comboHighlights = useMemo(
    () => hoveredCombo ? new Set(hoveredCombo.fromKeys) : undefined,
    [hoveredCombo]
  )

  function handleAdd(rule: ComboRule) {
    addRule(rule)
    setShowForm(false)
  }

  function handleEdit(rule: ComboRule) {
    if (!editing) return
    updateRule(editing.idx, rule) // keeps its position — Karabiner evaluates rules in order
    setEditing(null)
  }

  const [confirmIdx, setConfirmIdx] = useState<number | null>(null)
  function handleDelete(idx: number) { setConfirmIdx(idx) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>
          Combos ({combos.length})
        </h3>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(true); setEditing(null) }}>
          <Plus size={13} />
          Add
        </button>
      </div>

      {confirmIdx !== null && (
        <ConfirmBanner
          danger
          message={<>Delete combo <strong>{combos.find(c => c.idx === confirmIdx)?.rule.description ?? ''}</strong>?</>}
          confirmLabel="Delete"
          onConfirm={() => { removeRule(confirmIdx); setConfirmIdx(null) }}
          onCancel={() => setConfirmIdx(null)}
        />
      )}

      {/* Keyboard preview — all configured triggers at idle; focus and hover isolate a combo */}
      {combos.length > 0 && !showForm && !editing && (
        <div className="panel-inset" style={{ padding: '8px 12px', overflowX: 'auto' }}>
          <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 6 }}>
            {hoveredCombo
              ? `${hoveredCombo.fromKeys.map(k => displayKey(k)).join(' + ')} → ${displayKey(hoveredCombo.toKey)} — highlighted trigger keys`
              : 'Coloured keys are combo triggers. Split colours mean shared keys. Hover or focus a row to isolate a combo.'}
          </div>
          <MacbookKeyboard
            rules={rules}
            selectorMode
            comboHighlights={comboHighlights}
            comboColors={comboColors}
            comboHighlightColor={activeColor}
          />
        </div>
      )}

      {/* Forms */}
      {showForm && (
        <ComboForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
      )}
      {editing && (
        <ComboForm key={editing.idx} editing={editing.combo} onSave={handleEdit} onCancel={() => setEditing(null)} />
      )}

      {/* Combo list */}
      {combos.length === 0 && !showForm ? (
        <div className="panel-inset" style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 13 }}>
          No combos yet. Add one to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {combos.map(({ rule, idx }, i) => {
            const color = COMBO_COLORS[i % COMBO_COLORS.length]
            const isHov = activeIdx === idx
            return (
              <div
                key={idx}
                data-combo-row={idx}
                onFocus={() => setFocusedIdx(idx)}
                onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedIdx(null) }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  background: isHov ? 'var(--glass-bg-hover)' : 'var(--glass-bg)',
                  border: `1px solid ${isHov ? color : 'var(--glass-border)'}`,
                  boxShadow: isHov ? `inset 3px 0 ${color}` : undefined,
                  borderRadius: 8, padding: '7px 10px',
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'default',
                  transition: 'border-color var(--dur-1) var(--ease-out), background var(--dur-1) var(--ease-out)',
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                  {rule.fromKeys.map(kc => (
                    <span
                      key={kc}
                      className="tag"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: color, color: '#101827', borderColor: color, fontWeight: 650,
                      }}
                    >{displayKey(kc)}</span>
                  ))}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                  {rule.toModifiers && rule.toModifiers.length > 0 && (
                    <span className="tag tag-accent" style={{ fontFamily: 'var(--font-mono)' }}>{rule.toModifiers.join('+')}</span>
                  )}
                  <span className="tag tag-success" style={{ fontFamily: 'var(--font-mono)' }}>{displayKey(rule.toKey)}</span>
                </div>

                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button aria-label={`Edit combo ${rule.fromKeys.map(displayKey).join(" + ")}`} className="btn btn-secondary btn-sm" onClick={() => { setEditing({ combo: rule, idx }); setShowForm(false) }}>
                    Edit
                  </button>
                  <button aria-label={`Delete combo ${rule.fromKeys.map(displayKey).join(" + ")}`} className="btn btn-danger btn-sm" onClick={() => handleDelete(idx)}>×</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MacComboEditor
