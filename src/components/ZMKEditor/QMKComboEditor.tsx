import React, { useState, useEffect, useCallback } from 'react'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { parseQMKCombos, updateQMKCombosInSource, makeComboNames, type QMKCombo } from '../../lib/qmkComboParser'
import { useQMKStore } from '../../stores/qmkStore'
import QMKKeyboard from './QMKKeyboard'

const KEYMAP_C_PATH =
  '/Users/tomkwon/Documents/splitkey2/corne_procyon/corne_procyon36/keymaps/default/keymap.c'

const COMMON_TO_KEYS = [
  'KC_ENT', 'KC_ESC', 'KC_BSPC', 'KC_DEL', 'KC_TAB', 'KC_SPC',
  'KC_LCTL', 'KC_LSFT', 'KC_LALT', 'KC_LGUI',
  'KC_CAPS', 'KC_PSCR',
  'KC_UP', 'KC_DOWN', 'KC_LEFT', 'KC_RGHT',
  'KC_MPLY', 'KC_MUTE', 'KC_VOLU', 'KC_VOLD',
]

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

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-tertiary, #2a2a2a)',
  border: '1px solid var(--border, #3a3a3a)',
  borderRadius: 6,
  color: 'var(--text-primary, #eee)',
  padding: '4px 8px',
  fontSize: 12,
  outline: 'none',
}

const btnStyle = (primary = false, danger = false): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  backgroundColor: danger
    ? 'rgba(255,80,80,0.15)'
    : primary
    ? 'var(--accent, #7c6aff)'
    : 'var(--bg-secondary, #333)',
  color: danger ? '#ff6b6b' : primary ? '#fff' : 'var(--text-secondary, #aaa)',
})

/** Convert fromKeys array to highlighted key positions using the layer key list */
function fromKeysToPositions(layerKeys: string[], fromKeys: string[]): Set<number> {
  const positions = new Set<number>()
  for (let i = 0; i < layerKeys.length; i++) {
    if (fromKeys.includes(layerKeys[i])) positions.add(i)
  }
  return positions
}

// ── Add/Edit Form ─────────────────────────────────────────────────────────────

interface ComboFormProps {
  editing?: QMKCombo
  existingCombos: QMKCombo[]
  layerKeys: string[]
  onSave: (combo: QMKCombo) => void
  onCancel: () => void
}

const ComboForm: React.FC<ComboFormProps> = ({ editing, existingCombos, layerKeys, onSave, onCancel }) => {
  const [fromKeys, setFromKeys] = useState<string[]>(editing?.fromKeys ?? [])
  const [toInput, setToInput] = useState(editing?.toKey ?? 'KC_ENT')
  const [error, setError] = useState('')

  const highlightedPositions = fromKeysToPositions(layerKeys, fromKeys)

  const handleKeyClick = (pos: number) => {
    const kc = layerKeys[pos]
    if (!kc || kc === 'KC_TRNS' || kc === '_______' || kc === 'KC_NO' || kc === 'XXXXXXX') return
    setFromKeys((prev) =>
      prev.includes(kc) ? prev.filter((k) => k !== kc) : [...prev, kc]
    )
  }

  const handleSave = () => {
    if (fromKeys.length < 2) { setError('Select at least 2 keys on the keyboard below'); return }
    const outKey = toInput.trim()
    if (!outKey) { setError('Output key is required'); return }
    const otherCombos = editing ? existingCombos.filter((c) => c.name !== editing.name) : existingCombos
    const { name, enumName } = editing
      ? { name: editing.name, enumName: editing.enumName }
      : makeComboNames(otherCombos, outKey)
    onSave({ name, enumName, fromKeys, toKey: outKey })
  }

  const fallbackKeys = Array.from({ length: 44 }, (_, i) => `KC_${i}`)

  return (
    <div style={{
      background: 'var(--bg-secondary, #222)',
      border: '1px solid var(--border, #3a3a3a)',
      borderRadius: 8,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #eee)' }}>
        {editing ? `Edit: ${editing.name}` : 'Add Combo'}
      </div>

      {/* Output key */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>Output key (what gets sent)</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, width: 130 }}
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            placeholder="KC_ENT"
          />
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value=""
            onChange={(e) => { if (e.target.value) setToInput(e.target.value) }}
          >
            <option value="">Common…</option>
            {COMMON_TO_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>

      {/* From keys summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>
          Trigger keys — click keys on keyboard ({fromKeys.length} selected)
        </span>
        {fromKeys.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {fromKeys.map((kc) => (
              <span
                key={kc}
                style={{
                  fontSize: 11, background: 'var(--accent, #7c6aff)', color: '#fff',
                  borderRadius: 4, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {kc}
                <span
                  style={{ cursor: 'pointer', opacity: 0.7 }}
                  onClick={() => setFromKeys((prev) => prev.filter((k) => k !== kc))}
                >×</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Keyboard picker */}
      <div style={{
        background: 'var(--bg-primary, #1a1a1a)',
        border: '1px solid var(--border, #3a3a3a)',
        borderRadius: 8,
        padding: '8px 12px',
        overflowX: 'auto',
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted, #666)', marginBottom: 6 }}>
          Click keys to add/remove from trigger — highlighted = selected
        </div>
        <QMKKeyboard
          keys={layerKeys.length > 0 ? layerKeys : fallbackKeys}
          highlightedPositions={highlightedPositions}
          onKeyClick={handleKeyClick}
        />
      </div>

      {error && <div style={{ fontSize: 11, color: '#ff6b6b' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btnStyle(true)} onClick={handleSave}>{editing ? 'Save Changes' : 'Add Combo'}</button>
        <button style={btnStyle()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const QMKComboEditor: React.FC = () => {
  const { keymap } = useQMKStore()
  const layerKeys = keymap?.layers[0]?.keys ?? []

  const [combos, setCombos] = useState<QMKCombo[]>([])
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingCombo, setEditingCombo] = useState<QMKCombo | null>(null)
  const [hoveredCombo, setHoveredCombo] = useState<string | null>(null)

  const loadSource = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const text = await readTextFile(KEYMAP_C_PATH)
      setSource(text)
      setCombos(parseQMKCombos(text))
    } catch (err) {
      setLoadError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSource() }, [loadSource])

  const saveBack = async (newCombos: QMKCombo[]) => {
    try {
      const newSource = updateQMKCombosInSource(source, newCombos)
      await writeTextFile(KEYMAP_C_PATH, newSource)
      setSource(newSource)
      setCombos(newCombos)
      setStatus({ msg: 'Saved to keymap.c', ok: true })
      setTimeout(() => setStatus(null), 2500)
    } catch (err) {
      setStatus({ msg: `Error: ${err}`, ok: false })
    }
  }

  const handleAdd = (combo: QMKCombo) => { saveBack([...combos, combo]); setShowAddForm(false) }
  const handleEdit = (updated: QMKCombo) => {
    saveBack(combos.map((c) => (c.name === updated.name ? updated : c)))
    setEditingCombo(null)
  }
  const handleDelete = (name: string) => {
    if (!window.confirm(`Delete combo "${name}"?`)) return
    saveBack(combos.filter((c) => c.name !== name))
  }

  const hoveredComboObj = combos.find((c) => c.name === hoveredCombo) ?? null
  const highlightedForHover = hoveredComboObj
    ? fromKeysToPositions(layerKeys, hoveredComboObj.fromKeys)
    : new Set<number>()

  const fallbackKeys = Array.from({ length: 44 }, (_, i) => `KC_${i}`)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary, #aaa)', fontSize: 13 }}>
        Loading keymap.c…
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 12, color: '#ff6b6b', background: 'rgba(255,80,80,0.08)', borderRadius: 6, padding: '8px 12px', maxWidth: 420, wordBreak: 'break-all' }}>
          {loadError}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)' }}>
          Could not load <code style={{ fontFamily: 'monospace', fontSize: 10 }}>{KEYMAP_C_PATH}</code>
        </div>
        <button style={btnStyle(true)} onClick={loadSource}>Retry</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary, #eee)' }}>
          Combos ({combos.length})
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {status && (
            <span style={{ fontSize: 12, color: status.ok ? '#6fcf97' : '#ff6b6b' }}>{status.msg}</span>
          )}
          <button style={btnStyle()} onClick={loadSource}>Reload</button>
          <button style={btnStyle(true)} onClick={() => { setShowAddForm(true); setEditingCombo(null) }}>
            + Add
          </button>
        </div>
      </div>

      {/* Keyboard preview — hover a combo to see its keys lit up */}
      {combos.length > 0 && !showAddForm && !editingCombo && (
        <div style={{
          background: 'var(--bg-primary, #1a1a1a)',
          border: '1px solid var(--border, #3a3a3a)',
          borderRadius: 8,
          padding: '8px 12px',
          overflowX: 'auto',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #666)', marginBottom: 6 }}>
            {hoveredCombo
              ? `${hoveredCombo} — highlighted keys are the trigger`
              : 'Hover a combo to see its keys'}
          </div>
          <QMKKeyboard
            keys={layerKeys.length > 0 ? layerKeys : fallbackKeys}
            highlightedPositions={highlightedForHover}
          />
        </div>
      )}

      {/* Add/Edit forms */}
      {showAddForm && (
        <ComboForm
          existingCombos={combos}
          layerKeys={layerKeys}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}
      {editingCombo && (
        <ComboForm
          editing={editingCombo}
          existingCombos={combos}
          layerKeys={layerKeys}
          onSave={handleEdit}
          onCancel={() => setEditingCombo(null)}
        />
      )}

      {/* Combo list */}
      {combos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary, #aaa)', fontSize: 13 }}>
          No combos found in keymap.c
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {combos.map((combo, idx) => {
            const color = COMBO_COLORS[idx % COMBO_COLORS.length]
            const isHovered = hoveredCombo === combo.name
            return (
              <div
                key={combo.name}
                onMouseEnter={() => setHoveredCombo(combo.name)}
                onMouseLeave={() => setHoveredCombo(null)}
                style={{
                  background: isHovered ? 'rgba(255,255,255,0.05)' : 'var(--bg-secondary, #1e1e1e)',
                  border: `1px solid ${isHovered ? color : 'var(--border, #3a3a3a)'}`,
                  borderRadius: 8,
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'default',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Color swatch */}
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />

                {/* From keys → To key */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                  {combo.fromKeys.map((kc) => (
                    <span
                      key={kc}
                      style={{
                        fontSize: 11,
                        background: isHovered ? color : 'rgba(255,255,255,0.08)',
                        color: isHovered ? '#fff' : 'var(--text-secondary, #aaa)',
                        borderRadius: 4,
                        padding: '1px 6px',
                        fontFamily: 'monospace',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >{kc}</span>
                  ))}
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #666)' }}>→</span>
                  <span style={{
                    fontSize: 11,
                    background: 'rgba(52,211,153,0.15)',
                    color: '#6ee7b7',
                    borderRadius: 4,
                    padding: '1px 6px',
                    fontFamily: 'monospace',
                  }}>{combo.toKey}</span>
                </div>

                {/* Internal name */}
                <span style={{ fontSize: 10, color: 'var(--text-muted, #555)', fontFamily: 'monospace', flexShrink: 0 }}>
                  {combo.name}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button
                    style={btnStyle()}
                    onClick={() => { setEditingCombo(combo); setShowAddForm(false) }}
                  >Edit</button>
                  <button style={btnStyle(false, true)} onClick={() => handleDelete(combo.name)}>×</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default QMKComboEditor
