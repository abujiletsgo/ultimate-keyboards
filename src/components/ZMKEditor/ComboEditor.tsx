import React, { useState } from 'react'
import { useZMKStore } from '../../stores/zmkStore'
import type { ZMKCombo } from '../../lib/zmkParser'
import SplitKeyboard from './SplitKeyboard'

// ── Shared styles ─────────────────────────────────────────────────────────────

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

const BINDING_PRESETS = [
  '&kp ENTER', '&kp ESC', '&kp BACKSPACE', '&kp DELETE',
  '&kp SPACE', '&kp TAB', '&kp LCTRL', '&kp LSHIFT',
  '&kp LALT', '&kp LGUI', '&kp CAPSLOCK', '&caps_word',
  '&mo 1', '&mo 2', '&mo 3',
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

// ── Add/Edit Form ─────────────────────────────────────────────────────────────

interface ComboFormProps {
  editing?: ZMKCombo
  layerKeys: string[]
  onSave: (combo: ZMKCombo) => void
  onCancel: () => void
}

const ComboForm: React.FC<ComboFormProps> = ({ editing, layerKeys, onSave, onCancel }) => {
  const [name, setName] = useState(editing?.name ?? '')
  const [binding, setBinding] = useState(editing?.bindings ?? '&kp ENTER')
  const [selectedPositions, setSelectedPositions] = useState<Set<number>>(
    new Set(editing?.keyPositions ?? [])
  )
  const [layersText, setLayersText] = useState(editing?.layers?.join(' ') ?? '')
  const [error, setError] = useState('')

  const handleKeyClick = (pos: number) => {
    setSelectedPositions((prev) => {
      const next = new Set(prev)
      if (next.has(pos)) next.delete(pos)
      else next.add(pos)
      return next
    })
  }

  const handleSave = () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!binding.trim()) { setError('Binding is required'); return }
    if (selectedPositions.size < 2) { setError('Select at least 2 keys on the keyboard below'); return }
    const layers = layersText.trim()
      ? layersText.trim().split(/\s+/).map(Number).filter((n) => !isNaN(n))
      : undefined
    onSave({
      name: name.trim(),
      bindings: binding.trim(),
      keyPositions: Array.from(selectedPositions).sort((a, b) => a - b),
      layers,
    })
  }

  const fallbackKeys = Array.from({ length: 42 }, (_, i) => `&kp ${i}`)

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

      {/* Name + Binding row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>Name</span>
          <input
            style={{ ...inputStyle, width: 160 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="combo_esc"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>Output binding</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 130 }}
              value={binding}
              onChange={(e) => setBinding(e.target.value)}
              placeholder="&kp ENTER"
            />
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value=""
              onChange={(e) => { if (e.target.value) setBinding(e.target.value) }}
            >
              <option value="">Presets…</option>
              {BINDING_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>Layers (optional)</span>
          <input
            style={{ ...inputStyle, width: 100 }}
            value={layersText}
            onChange={(e) => setLayersText(e.target.value)}
            placeholder="0 1"
          />
        </label>
      </div>

      {/* Selected positions summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>
          Trigger keys — click keys on keyboard ({selectedPositions.size} selected)
        </span>
        {selectedPositions.size > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {Array.from(selectedPositions).sort((a, b) => a - b).map((pos) => (
              <span
                key={pos}
                style={{
                  fontSize: 11,
                  background: 'var(--accent, #7c6aff)',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '2px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: 'monospace',
                }}
              >
                pos {pos}
                {layerKeys[pos] && (
                  <span style={{ opacity: 0.7, fontSize: 10 }}>({layerKeys[pos].replace(/^&kp /, '')})</span>
                )}
                <span
                  style={{ cursor: 'pointer', opacity: 0.7 }}
                  onClick={() => setSelectedPositions((prev) => { const n = new Set(prev); n.delete(pos); return n })}
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
          Click keys to add/remove — highlighted = selected
        </div>
        <SplitKeyboard
          layer={{ index: 0, name: 'pick', keys: layerKeys.length > 0 ? layerKeys : fallbackKeys }}
          highlightedPositions={selectedPositions}
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

// ── Main ComboEditor ──────────────────────────────────────────────────────────

const ComboEditor: React.FC = () => {
  const { keymap, addCombo, updateCombo, deleteCombo } = useZMKStore()

  const combos = keymap?.combos ?? []
  const layerKeys = keymap?.layers[0]?.keys ?? []

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingCombo, setEditingCombo] = useState<ZMKCombo | null>(null)
  const [hoveredCombo, setHoveredCombo] = useState<string | null>(null)

  const hoveredComboObj = combos.find((c) => c.name === hoveredCombo) ?? null
  const highlightedForHover = hoveredComboObj
    ? new Set<number>(hoveredComboObj.keyPositions)
    : new Set<number>()

  const handleAdd = (combo: ZMKCombo) => {
    addCombo(combo)
    setShowAddForm(false)
  }

  const handleEdit = (updated: ZMKCombo) => {
    if (!editingCombo) return
    updateCombo(editingCombo.name, updated)
    setEditingCombo(null)
  }

  const handleDelete = (name: string) => {
    if (!window.confirm(`Delete combo "${name}"?`)) return
    deleteCombo(name)
  }

  const fallbackKeys = Array.from({ length: 42 }, (_, i) => `&kp ${i}`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary, #eee)', fontWeight: 600 }}>
          Combos ({combos.length})
        </h3>
        <button style={btnStyle(true)} onClick={() => { setShowAddForm(true); setEditingCombo(null) }}>
          + Add
        </button>
      </div>

      {/* Keyboard visualization — hover a combo to highlight its keys */}
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
              ? `${hoveredCombo} — highlighted keys trigger this combo`
              : 'Hover a combo to see its keys'}
          </div>
          <SplitKeyboard
            layer={{ index: 0, name: 'preview', keys: layerKeys.length > 0 ? layerKeys : fallbackKeys }}
            highlightedPositions={highlightedForHover}
          />
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <ComboForm
          layerKeys={layerKeys}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Edit form */}
      {editingCombo && (
        <ComboForm
          editing={editingCombo}
          layerKeys={layerKeys}
          onSave={handleEdit}
          onCancel={() => setEditingCombo(null)}
        />
      )}

      {/* Combo list */}
      {combos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary, #aaa)', fontSize: 13 }}>
          No combos defined. Add one above.
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

                {/* Positions with key labels → binding */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                  {combo.keyPositions.map((pos) => {
                    const kc = layerKeys[pos]?.replace(/^&kp /, '') ?? `pos${pos}`
                    return (
                      <span
                        key={pos}
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
                    )
                  })}
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #666)' }}>→</span>
                  <span style={{
                    fontSize: 11,
                    background: 'rgba(52,211,153,0.15)',
                    color: '#6ee7b7',
                    borderRadius: 4,
                    padding: '1px 6px',
                    fontFamily: 'monospace',
                  }}>{combo.bindings}</span>
                  {combo.layers && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted, #666)' }}>
                      L:{combo.layers.join(',')}
                    </span>
                  )}
                </div>

                {/* Name */}
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

export default ComboEditor
