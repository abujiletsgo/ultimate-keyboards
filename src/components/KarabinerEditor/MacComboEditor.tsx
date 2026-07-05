import React, { useState, useMemo } from 'react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { MODIFIER_NAMES, type ComboRule } from '@/lib/karabinerGenerator'
import type { MacKey } from '@/lib/macbookLayout'
import MacbookKeyboard from './MacbookKeyboard'

const COMBO_COLORS = [
  'rgba(124,106,255,0.7)',
  'rgba(52,211,153,0.7)',
  'rgba(251,146,60,0.7)',
  'rgba(56,189,248,0.7)',
  'rgba(244,114,182,0.7)',
  'rgba(245,158,11,0.7)',
  'rgba(239,68,68,0.7)',
  'rgba(167,243,208,0.7)',
]

const COMMON_TO_KEYS = [
  'return_or_enter', 'escape', 'delete_or_backspace', 'tab', 'spacebar',
  'left_command', 'left_option', 'left_control', 'left_shift',
  'up_arrow', 'down_arrow', 'left_arrow', 'right_arrow',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
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

const s = {
  input: {
    background: 'var(--bg-tertiary, #2a2a2a)',
    border: '1px solid var(--border, #3a3a3a)',
    borderRadius: 6,
    color: 'var(--text-primary, #eee)',
    padding: '4px 8px',
    fontSize: 12,
    outline: 'none',
  } as React.CSSProperties,
  btn: (primary = false, danger = false): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
    backgroundColor: danger
      ? 'rgba(255,80,80,0.15)'
      : primary ? 'var(--accent, #7c6aff)' : 'var(--bg-secondary, #333)',
    color: danger ? '#ff6b6b' : primary ? '#fff' : 'var(--text-secondary, #aaa)',
  }),
}

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

  const selectedKeys = useMemo(() => new Set(fromKeys), [fromKeys])

  const toggleKey = (key: MacKey) => {
    const code = key.code
    setFromKeys(prev =>
      prev.includes(code) ? prev.filter(k => k !== code) : [...prev, code]
    )
  }

  const toggleMod = (mod: string) =>
    setToMods(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])

  const handleSave = () => {
    if (fromKeys.length < 2) { setError('Select at least 2 keys on the keyboard below'); return }
    if (!toKey.trim()) { setError('Output key is required'); return }
    const desc = `${fromKeys.join('+')} → ${toMods.length ? toMods.join('+')+'+' : ''}${toKey}`
    onSave({
      type: 'combo',
      description: editing?.description ?? desc,
      fromKeys,
      toKey: toKey.trim(),
      toModifiers: toMods.length > 0 ? toMods : undefined,
    })
  }

  return (
    <div style={{
      background: 'var(--bg-secondary, #222)', border: '1px solid var(--border, #3a3a3a)',
      borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #eee)' }}>
        {editing ? 'Edit Combo' : 'Add Combo'}
      </div>

      {/* Output key */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>Output key</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            style={{ ...s.input, width: 140 }}
            value={toKey}
            onChange={e => setToKey(e.target.value)}
            placeholder="escape"
          />
          <select
            style={{ ...s.input, cursor: 'pointer' }}
            value=""
            onChange={e => { if (e.target.value) setToKey(e.target.value) }}
          >
            <option value="">Common…</option>
            {COMMON_TO_KEYS.map(k => <option key={k} value={k}>{displayKey(k)}</option>)}
          </select>
        </div>
      </div>

      {/* Modifiers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>Output modifiers (optional)</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {MODIFIER_NAMES.map(mod => {
            const active = toMods.includes(mod)
            const sym: Record<string, string> = { command: '⌘', option: '⌥', control: '⌃', shift: '⇧', fn: 'fn' }
            return (
              <button key={mod} onClick={() => toggleMod(mod)} style={{
                padding: '3px 8px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                background: active ? 'rgba(124,106,255,0.3)' : 'rgba(255,255,255,0.06)',
                border: active ? '1px solid rgba(124,106,255,0.6)' : '1px solid rgba(255,255,255,0.1)',
                color: active ? '#c4baff' : 'var(--text-muted, #888)',
              }}>{sym[mod] ?? mod}</button>
            )
          })}
        </div>
      </div>

      {/* Trigger keys summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>
          Trigger keys — click keys on keyboard ({fromKeys.length} selected, need ≥ 2)
        </span>
        {fromKeys.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {fromKeys.map(kc => (
              <span key={kc} style={{
                fontSize: 11, background: 'var(--accent, #7c6aff)', color: '#fff',
                borderRadius: 4, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'monospace',
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
      <div style={{
        background: 'var(--bg-primary, #1a1a1a)', border: '1px solid var(--border, #3a3a3a)',
        borderRadius: 8, padding: '8px 12px', overflowX: 'auto',
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted, #666)', marginBottom: 6 }}>
          Click keys to add/remove from trigger — highlighted = selected
        </div>
        <MacbookKeyboard
          rules={rules}
          selectorMode
          selectedKeys={selectedKeys}
          onKeyClick={toggleKey}
        />
      </div>

      {error && <div style={{ fontSize: 11, color: '#ff6b6b' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button style={s.btn(true)} onClick={handleSave}>{editing ? 'Save Changes' : 'Add Combo'}</button>
        <button style={s.btn()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

const MacComboEditor: React.FC = () => {
  const { rules, addRule, removeRule } = useKarabinerStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<{ combo: ComboRule; idx: number } | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const combos = rules
    .map((r, i) => ({ rule: r, idx: i }))
    .filter(({ rule }) => rule.type === 'combo') as { rule: ComboRule; idx: number }[]

  const hoveredCombo = hoveredIdx !== null ? combos.find(c => c.idx === hoveredIdx)?.rule ?? null : null
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
    // Replace rule at original index: remove old, insert updated
    // Since removeRule uses index, we need to work around the current rules array
    removeRule(editing.idx)
    // After removal the index shifts, so we re-add at end and accept the order change
    addRule(rule)
    setEditing(null)
  }

  function handleDelete(idx: number) {
    if (!window.confirm('Delete this combo?')) return
    removeRule(idx)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary, #eee)' }}>
          Combos ({combos.length})
        </h3>
        <button style={s.btn(true)} onClick={() => { setShowForm(true); setEditing(null) }}>
          + Add
        </button>
      </div>

      {/* Keyboard preview — hover a combo to see its keys lit up */}
      {combos.length > 0 && !showForm && !editing && (
        <div style={{
          background: 'var(--bg-primary, #1a1a1a)', border: '1px solid var(--border, #3a3a3a)',
          borderRadius: 8, padding: '8px 12px', overflowX: 'auto',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #666)', marginBottom: 6 }}>
            {hoveredCombo
              ? `${hoveredCombo.fromKeys.map(k => displayKey(k)).join(' + ')} — highlighted trigger keys`
              : 'Hover a combo below to preview its trigger keys'}
          </div>
          <MacbookKeyboard
            rules={rules}
            selectorMode
            comboHighlights={comboHighlights}
          />
        </div>
      )}

      {/* Forms */}
      {showForm && (
        <ComboForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
      )}
      {editing && (
        <ComboForm editing={editing.combo} onSave={handleEdit} onCancel={() => setEditing(null)} />
      )}

      {/* Combo list */}
      {combos.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary, #aaa)', fontSize: 13 }}>
          No combos yet. Add one to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {combos.map(({ rule, idx }, i) => {
            const color = COMBO_COLORS[i % COMBO_COLORS.length]
            const isHov = hoveredIdx === idx
            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  background: isHov ? 'rgba(255,255,255,0.05)' : 'var(--bg-secondary, #1e1e1e)',
                  border: `1px solid ${isHov ? color : 'var(--border, #3a3a3a)'}`,
                  borderRadius: 8, padding: '7px 10px',
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'default',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                  {rule.fromKeys.map(kc => (
                    <span key={kc} style={{
                      fontSize: 11,
                      background: isHov ? color : 'rgba(255,255,255,0.08)',
                      color: isHov ? '#fff' : 'var(--text-secondary, #aaa)',
                      borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace',
                      transition: 'background 0.15s, color 0.15s',
                    }}>{displayKey(kc)}</span>
                  ))}
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #666)' }}>→</span>
                  {rule.toModifiers && rule.toModifiers.length > 0 && (
                    <span style={{
                      fontSize: 11, background: 'rgba(124,106,255,0.18)', color: '#a78bfa',
                      borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace',
                    }}>{rule.toModifiers.join('+')}</span>
                  )}
                  <span style={{
                    fontSize: 11, background: 'rgba(52,211,153,0.15)', color: '#6ee7b7',
                    borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace',
                  }}>{displayKey(rule.toKey)}</span>
                </div>

                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button style={s.btn()} onClick={() => { setEditing({ combo: rule, idx }); setShowForm(false) }}>
                    Edit
                  </button>
                  <button style={s.btn(false, true)} onClick={() => handleDelete(idx)}>×</button>
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
