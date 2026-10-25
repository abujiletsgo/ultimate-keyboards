/**
 * MacKeyEditor — click-to-popover for MacBook key remapping.
 * Appears anchored to the clicked key, matching BindingEditor's style.
 */
import { useState, useRef, useMemo, useId } from 'react'
import { Plus, X } from 'lucide-react'
import { Popover, DeleteButton } from '@/components/ui'
import { KEY_CODES, MODIFIER_NAMES, HOMEROW_HOLD_MS, type SimpleRemapRule, type ComboRule, type LayerActivatorRule, type LayerBindingRule } from '@/lib/karabinerGenerator'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { macBaseRuleIndex, macLayerBindingIndex, macLayerBindingEdit, macLayers, macKeyFace } from '@/lib/macKeymapView'
import type { MacKey } from '@/lib/macbookLayout'

interface Props {
  macKey: MacKey
  selectedLayer?: string | null
  anchorX: number
  anchorY: number
  anchorTop?: number
  onClose: () => void
}

type Mode = 'remap' | 'combo' | 'layer_activate' | 'layer_bind'

const KEY_LABELS: Record<string, string> = {
  'return_or_enter': 'Enter',
  'delete_or_backspace': 'Backspace',
  'escape': 'Esc',
  'spacebar': 'Space',
  'caps_lock': 'Caps',
  'left_shift': '⇧L',
  'right_shift': '⇧R',
  'left_control': '⌃L',
  'right_control': '⌃R',
  'left_option': '⌥L',
  'right_option': '⌥R',
  'left_command': '⌘L',
  'right_command': '⌘R',
  'up_arrow': '↑',
  'down_arrow': '↓',
  'left_arrow': '←',
  'right_arrow': '→',
  'grave_accent_and_tilde': '`~',
  'hyphen': '-',
  'equal_sign': '=',
  'open_bracket': '[',
  'close_bracket': ']',
  'backslash': '\\',
  'semicolon': ';',
  'quote': "'",
  'comma': ',',
  'period': '.',
  'slash': '/',
}

function displayKey(k: string) {
  return KEY_LABELS[k] ?? k
}

// ── Searchable key dropdown ───────────────────────────────────────────────────

function KeyDropdown({ value, onChange, emptyLabel = 'Choose a key' }: { value: string; onChange: (v: string) => void; emptyLabel?: string }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState({ x: 0, y: 0, top: 0 })

  const filtered = useMemo(() => {
    if (!query) return KEY_CODES.slice(0, 50)
    const q = query.toLowerCase()
    return KEY_CODES.filter(k => k.includes(q) || (KEY_LABELS[k] ?? '').toLowerCase().includes(q)).slice(0, 50)
  }, [query])

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button
        ref={btnRef}
        className="btn btn-secondary btn-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open && btnRef.current) { const r = btnRef.current.getBoundingClientRect(); setAnchor({ x: r.left, y: r.bottom + 4, top: r.top - 4 }) }
          setOpen(v => !v)
        }}
        style={{ width: '100%', justifyContent: 'flex-start', fontFamily: 'var(--font-mono)' }}
      >
        {value ? displayKey(value) : emptyLabel} {value && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({value})</span>} ▾
      </button>
      {open && (
        <Popover anchor={anchor} width={220} layer="menu" noBackdrop label="Choose a key" onClose={() => setOpen(false)}
          onOutsideMouseDown={(t) => { if (!btnRef.current?.contains(t)) setOpen(false) }}>
        <div style={{ maxHeight: 240, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search key…"
            onKeyDown={e => {
              if (e.key === 'Enter' && filtered.length > 0) {
                // Closing restores focus to the trigger; suppress Enter's default
                // activation so that key selection does not reopen the menu.
                e.preventDefault()
                e.stopPropagation()
                onChange(filtered[0]); setOpen(false); setQuery('')
              }
            }}
            style={{ margin: 6, height: 26, fontSize: 11 }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(k => (
              <div
                key={k}
                onClick={() => { onChange(k); setOpen(false); setQuery('') }}
                className="menu-item"
                role="option"
                aria-selected={k === value}
              >
                <span style={{ minWidth: 28, color: 'var(--text)' }}>{displayKey(k)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
        </Popover>
      )}
    </div>
  )
}

// ── Modifier pills ────────────────────────────────────────────────────────────

function ModPills({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (mod: string) =>
    onChange(selected.includes(mod) ? selected.filter(m => m !== mod) : [...selected, mod])
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {MODIFIER_NAMES.map(mod => {
        const active = selected.includes(mod)
        const symbol: Record<string, string> = { command: '⌘', option: '⌥', control: '⌃', shift: '⇧', fn: 'fn' }
        return (
          <button
            key={mod}
            onClick={() => toggle(mod)}
            style={{
              padding: '3px 8px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
              background: active ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.06)',
              border: active ? '1px solid rgba(45,212,191,0.6)' : '1px solid rgba(255,255,255,0.1)',
              color: active ? 'var(--accent-hover)' : 'var(--text-muted)',
              transition: 'background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out)',
            }}
          >
            {symbol[mod] ?? mod}
          </button>
        )
      })}
    </div>
  )
}

// ── Main popover ──────────────────────────────────────────────────────────────

export default function MacKeyEditor({ macKey, anchorX, anchorY, anchorTop, onClose, selectedLayer = null }: Props) {
  const { rules, addRule, removeRule, updateRule } = useKarabinerStore()
  const baseIndex = macBaseRuleIndex(rules, macKey.code)
  const baseRule = rules[baseIndex]
  const currentRemap = baseRule?.type === 'simple' ? baseRule : undefined
  const currentLayer = selectedLayer === null && baseRule?.type === 'layer_activator' ? baseRule : undefined
  const currentBinding = selectedLayer !== null ? rules[macLayerBindingIndex(rules, macKey.code, selectedLayer)] as LayerBindingRule | undefined : undefined
  const [mode, setMode] = useState<Mode>(selectedLayer !== null ? 'layer_bind' : currentLayer ? 'layer_activate' : 'remap')

  // Remap state
  const [toKey, setToKey] = useState(currentRemap?.toKey ?? macKey.code)
  const [toMods, setToMods] = useState<string[]>(currentRemap?.toModifiers ?? [])

  // Combo state
  const [comboKeys, setComboKeys] = useState<string[]>([macKey.code])
  const [comboTo, setComboTo] = useState('escape')
  const [comboToMods, setComboToMods] = useState<string[]>([])

  // Layer activate state
  const [layerName, setLayerName] = useState(currentLayer?.layerName ?? `layer_${macKey.code.replace(/[^a-z0-9]/g, '_')}`)
  const [tapKey, setTapKey] = useState(currentLayer?.tapKey ?? '')
  const [holdBehavior, setHoldBehavior] = useState<NonNullable<LayerActivatorRule['holdBehavior']>>(currentLayer?.holdBehavior ?? 'balanced')
  const [editingLayer, setEditingLayer] = useState<LayerActivatorRule | null>(currentLayer ?? null)
  const timingId = useId()

  // Layer bind state — pick an existing layer activator
  const layerActivators = macLayers(rules).slice(1).map(layer => ({ layerName: layer.name!, fromKey: layer.activators.join(', ') || 'no activator' }))
  const [bindLayerName, setBindLayerName] = useState(selectedLayer ?? layerActivators[0]?.layerName ?? '')
  const [bindTo, setBindTo] = useState(currentBinding?.toKey ?? macKey.code)
  const [bindToMods, setBindToMods] = useState<string[]>(currentBinding?.toModifiers ?? [])

  // Existing rules for this key
  const existingRules = rules.filter(r => {
    if (selectedLayer !== null) return r.type === 'layer_binding' && r.layerName === selectedLayer && r.fromKey === macKey.code
    if (r.type === 'simple') return r.fromKey === macKey.code
    if (r.type === 'combo') return r.fromKeys.includes(macKey.code)
    if (r.type === 'layer_activator') return r.fromKey === macKey.code
    if (r.type === 'layer_binding') return r.fromKey === macKey.code
    if (r.type === 'homerow_mod') return r.fromKey === macKey.code
    return false
  })

  function handleAddRemap() {
    const rule: SimpleRemapRule = {
      ...currentRemap,
      type: 'simple',
      description: currentRemap?.description ?? `${macKey.code} → ${toKey}`,
      fromKey: macKey.code,
      toKey,
      toModifiers: toMods.length > 0 ? toMods : undefined,
    }
    if (currentRemap) updateRule(baseIndex, rule)
    else addRule(rule)
    onClose()
  }

  function handleAddCombo() {
    if (comboKeys.length < 2) return
    const rule: ComboRule = {
      type: 'combo',
      description: `${comboKeys.join('+')} → ${comboTo}`,
      fromKeys: comboKeys,
      toKey: comboTo,
      toModifiers: comboToMods.length > 0 ? comboToMods : undefined,
    }
    addRule(rule)
    onClose()
  }

  function handleAddLayerActivate() {
    const rule: LayerActivatorRule = {
      ...editingLayer,
      type: 'layer_activator',
      description: editingLayer?.description ?? `${macKey.code} → activate ${layerName}`,
      fromKey: macKey.code,
      layerName: editingLayer?.layerName ?? (layerName.trim() || `layer_${macKey.code}`),
      tapKey: tapKey || undefined,
      holdBehavior,
    }
    const index = editingLayer ? rules.indexOf(editingLayer) : -1
    if (index >= 0) updateRule(index, rule)
    else addRule(rule)
    onClose()
  }

  function handleAddLayerBind() {
    if (!bindLayerName) return
    const edit = macLayerBindingEdit(rules, macKey.code, bindLayerName, bindTo, bindToMods)
    if (edit.index >= 0) updateRule(edit.index, edit.rule)
    else addRule(edit.rule)
    onClose()
  }

  function toggleComboKey(k: string) {
    setComboKeys(prev =>
      prev.includes(k) ? (prev.length > 1 ? prev.filter(x => x !== k) : prev) : [...prev, k]
    )
  }

  // Letter keys for combo grid
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

  const MODE_LABELS: Record<Mode, string> = {
    remap: 'Remap',
    combo: 'Combo',
    layer_activate: 'Layer Key',
    layer_bind: 'In Layer',
  }

  if (macKey.code === 'power') return (
    <Popover anchor={{ x: anchorX, y: anchorY, top: anchorTop }} width={290} label="Touch ID" onClose={onClose}>
      <div style={{ padding: 14, fontSize: 12, lineHeight: 1.6 }}>
        Touch ID is controlled by macOS. Native key mappings do not change this key.
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={onClose}>Close</button>
      </div>
    </Popover>
  )

  return (
    <Popover anchor={{ x: anchorX, y: anchorY, top: anchorTop }} width={290} label={`Configure ${macKey.label}`} onClose={onClose}>
      <div style={{ overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '10px 12px 8px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {macKey.label}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{macKey.code}</span>
          </div>
          <div className="seg-ctrl" style={{ flexWrap: 'wrap' }}>
            {(selectedLayer !== null ? ['layer_bind'] as Mode[] : Object.keys(MODE_LABELS) as Mode[]).map(m => (
              <button
                key={m}
                className={`seg-btn${mode === m ? ' active' : ''}`}
                onClick={() => setMode(m)}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {selectedLayer !== null && <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text)', overflowWrap: 'anywhere' }}>
          Layer: <strong>{selectedLayer}</strong>. {!currentBinding && 'No layer binding yet; this key falls back to Base.'}
          {macKeyFace(rules, macKey, selectedLayer).shadowedBy !== undefined && <p style={{ color: 'var(--warning)', marginTop: 5 }}>
            An earlier Base rule takes priority. Review ordered rules if this binding is not used.
          </p>}
        </div>}
        {/* Existing rules for this key */}
        {existingRules.length > 0 && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Current mappings
            </div>
            {existingRules.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, fontFamily: 'var(--font-mono)' }}>
                  {r.description}
                </span>
                {r.type === 'layer_activator' && <button className="btn btn-secondary btn-sm"
                  aria-label={`Edit layer ${r.layerName}`}
                  onClick={() => {
                    setEditingLayer(r)
                    setLayerName(r.layerName)
                    setTapKey(r.tapKey ?? '')
                    setHoldBehavior(r.holdBehavior ?? 'balanced')
                    setMode('layer_activate')
                  }}>Edit</button>}
                <DeleteButton label={`Remove rule: ${r.description}`} onClick={() => {
                  if (r === editingLayer) setEditingLayer(null)
                  removeRule(rules.indexOf(r))
                }} />
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '12px 12px 10px' }}>
          {mode === 'remap' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 40, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</span>
                <KeyDropdown value={toKey} onChange={setToKey} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 40, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mods</span>
                <ModPills selected={toMods} onChange={setToMods} />
              </div>
            </div>
          ) : mode === 'layer_activate' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Hold <b style={{ color: 'var(--text)' }}>{macKey.label}</b> to activate a layer. Other keys can then bind to this layer.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 56, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{editingLayer ? 'Layer (fixed)' : 'Layer name'}</span>
                <input
                  aria-label="Layer name"
                  readOnly={!!editingLayer}
                  title={editingLayer ? "Layer name stays fixed to preserve existing bindings." : undefined}
                  value={layerName}
                  onChange={e => setLayerName(e.target.value.replace(/\s/g, '_'))}
                  style={{ flex: 1, height: 28, fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  placeholder="e.g. nav_layer"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 56, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tap key</span>
                <KeyDropdown value={tapKey} onChange={setTapKey} emptyLabel="None · immediate" />
                <button
                  className="btn btn-ghost btn-sm"
                  aria-label="Remove tap key"
                  onClick={() => setTapKey('')}
                >none</button>
              </div>
              {tapKey ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <fieldset aria-describedby={`${timingId}-help`} style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontSize: 11, color: 'var(--text)', marginBottom: 5 }}>Native layer timing</legend>
                  {([
                    ['balanced', 'Balanced', 'another key tapped'],
                    ['hold_preferred', 'Fast chord', 'another key pressed'],
                    ['tap_preferred', 'Timed', 'wait hold threshold'],
                  ] as const).map(([value, label, hint]) => <label key={value} style={{
                    display: 'flex', alignItems: 'center', gap: 7, minHeight: 27, fontSize: 11,
                    color: 'var(--text)', cursor: 'pointer',
                  }}>
                    <input type="radio" name={timingId} value={value} checked={holdBehavior === value}
                      aria-label={label} onChange={() => setHoldBehavior(value)}
                      style={{ width: 14, height: 14, padding: 0, margin: 0, accentColor: 'var(--accent)' }} />
                    <span><b>{label}</b> · {hint}</span>
                  </label>)}
                </fieldset>
                <p id={`${timingId}-help`} style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text)' }}>
                  {holdBehavior === 'balanced'
                    ? `Resolve as a layer when another key is tapped (pressed and released), or after ${HOMEROW_HOLD_MS} ms. Default for existing rules.`
                    : holdBehavior === 'hold_preferred'
                    ? `Activate on another key press, or after ${HOMEROW_HOLD_MS} ms. Rolling taps can be treated as layer chords.`
                    : `Wait ${HOMEROW_HOLD_MS} ms before activating the layer, even when another key is pressed.`}
                </p>
              </div> : <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text)' }}>
                Native: activates immediately on key press and releases on key up. No tap action or hold delay.
              </p>}
              <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                Native timing only. Optional Karabiner export keeps its legacy hold timing.
              </p>
            </div>
          ) : mode === 'layer_bind' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {layerActivators.length === 0 ? (
                <div className="panel-inset" style={{ fontSize: 11, color: 'var(--warning)', background: 'rgba(251,191,36,0.08)', padding: '8px 10px' }}>
                  No layer keys defined yet. Click another key and choose "Layer Key" first.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 44, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Layer</span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                      {layerActivators.filter(la => selectedLayer === null || la.layerName === selectedLayer).map(la => (
                        <button
                          key={la.layerName}
                          title={la.layerName}
                          onClick={() => {
                            setBindLayerName(la.layerName)
                            const rule = rules[macLayerBindingIndex(rules, macKey.code, la.layerName)] as LayerBindingRule | undefined
                            setBindTo(rule?.toKey ?? macKey.code)
                            setBindToMods(rule?.toModifiers ?? [])
                          }}
                          style={{
                            padding: '3px 8px', borderRadius: 20, fontSize: 10, cursor: 'pointer',
                            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            background: bindLayerName === la.layerName ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.07)',
                            border: bindLayerName === la.layerName ? '1px solid rgba(34,211,238,0.5)' : '1px solid rgba(255,255,255,0.1)',
                            color: bindLayerName === la.layerName ? 'var(--accent-2)' : 'var(--text-muted)',
                            transition: 'background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out)',
                          }}
                        >
                          {la.layerName} ({la.fromKey})
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 44, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</span>
                    <KeyDropdown value={bindTo} onChange={setBindTo} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 44, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mods</span>
                    <ModPills selected={bindToMods} onChange={setBindToMods} />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Keys (press simultaneously)
              </div>
              {/* Letter grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 3 }}>
                {LETTERS.map(k => {
                  const active = comboKeys.includes(k)
                  return (
                    <button
                      key={k}
                      onClick={() => toggleComboKey(k)}
                      style={{
                        height: 22, borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        background: active ? 'var(--accent-grad)' : 'rgba(255,255,255,0.07)',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        border: active ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        transition: 'background var(--dur-1) var(--ease-out)',
                      }}
                    >
                      {k}
                    </button>
                  )
                })}
              </div>
              {/* Active combo keys display */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 24 }}>
                {comboKeys.map(k => (
                  <span key={k} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '2px 7px', background: 'var(--accent-grad)', color: '#fff',
                    borderRadius: 20, fontSize: 11, fontWeight: 500,
                  }}>
                    {k}
                    {comboKeys.length > 1 && (
                      <button onClick={() => toggleComboKey(k)} style={{ color: '#fff', opacity: 0.7, padding: 0, lineHeight: 1 }}>
                        <X size={10} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 40, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</span>
                <KeyDropdown value={comboTo} onChange={setComboTo} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 40, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mods</span>
                <ModPills selected={comboToMods} onChange={setComboToMods} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 12px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={
              mode === 'remap' ? handleAddRemap :
              mode === 'combo' ? handleAddCombo :
              mode === 'layer_activate' ? handleAddLayerActivate :
              handleAddLayerBind
            }
            disabled={
              (mode === 'combo' && comboKeys.length < 2) ||
              (mode === 'layer_bind' && (!bindLayerName || layerActivators.length === 0))
            }
          >
            <Plus size={11} />
            {mode === 'layer_activate' && editingLayer ? 'Save Layer Key' : mode === 'layer_bind' && macLayerBindingIndex(rules, macKey.code, bindLayerName) >= 0 ? 'Save Layer Binding' : mode === 'remap' && currentRemap ? 'Save Remap' : `Add ${MODE_LABELS[mode]}`}
          </button>
        </div>
      </div>
    </Popover>
  )
}
