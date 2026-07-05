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
  fontSize: 12,
}

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
    <div className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
        {editing ? `Edit: ${editing.name}` : 'Add Combo'}
      </div>

      {/* Name + Binding row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Name</span>
          <input
            style={{ ...inputStyle, width: 160 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="combo_esc"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Output binding</span>
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
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Layers (optional)</span>
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
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          Trigger keys — click keys on keyboard ({selectedPositions.size} selected)
        </span>
        {selectedPositions.size > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {Array.from(selectedPositions).sort((a, b) => a - b).map((pos) => (
              <span key={pos} className="tag tag-accent" style={{ gap: 4, fontFamily: 'var(--font-mono)' }}>
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
      <div className="panel-inset" style={{ padding: '8px 12px', overflowX: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
          Click keys to add/remove — highlighted = selected
        </div>
        <SplitKeyboard
          layer={{ index: 0, name: 'pick', keys: layerKeys.length > 0 ? layerKeys : fallbackKeys }}
          highlightedPositions={selectedPositions}
          onKeyClick={handleKeyClick}
        />
      </div>

      {error && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save Changes' : 'Add Combo'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
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
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
          Combos ({combos.length})
        </h3>
        <button className="btn btn-primary" onClick={() => { setShowAddForm(true); setEditingCombo(null) }}>
          + Add
        </button>
      </div>

      {/* Keyboard visualization — hover a combo to highlight its keys */}
      {combos.length > 0 && !showAddForm && !editingCombo && (
        <div className="panel-inset" style={{ padding: '8px 12px', overflowX: 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
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
        <div className="panel-inset" style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 13 }}>
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
                className="panel-inset"
                onMouseEnter={() => setHoveredCombo(combo.name)}
                onMouseLeave={() => setHoveredCombo(null)}
                style={{
                  background: isHovered ? 'rgba(255,255,255,0.05)' : undefined,
                  borderColor: isHovered ? color : undefined,
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'default',
                  transition: 'border-color var(--dur-1) var(--ease-out), background var(--dur-1) var(--ease-out)',
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
                        className="tag"
                        style={{
                          background: isHovered ? color : undefined,
                          color: isHovered ? '#fff' : undefined,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >{kc}</span>
                    )
                  })}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                  <span className="tag tag-success" style={{ fontFamily: 'var(--font-mono)' }}>{combo.bindings}</span>
                  {combo.layers && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      L:{combo.layers.join(',')}
                    </span>
                  )}
                </div>

                {/* Name */}
                <span className="mono" style={{ flexShrink: 0 }}>
                  {combo.name}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setEditingCombo(combo); setShowAddForm(false) }}
                  >Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(combo.name)}>×</button>
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
