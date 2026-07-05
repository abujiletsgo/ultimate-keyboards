/**
 * MacKeyEditor — click-to-popover for MacBook key remapping.
 * Appears anchored to the clicked key, matching BindingEditor's style.
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { KEY_CODES, MODIFIER_NAMES, type SimpleRemapRule, type ComboRule, type LayerActivatorRule, type LayerBindingRule } from '@/lib/karabinerGenerator'
import { useKarabinerStore } from '@/stores/karabinerStore'
import type { MacKey } from '@/lib/macbookLayout'

interface Props {
  macKey: MacKey
  anchorX: number
  anchorY: number
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

function KeyDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!query) return KEY_CODES.slice(0, 50)
    const q = query.toLowerCase()
    return KEY_CODES.filter(k => k.includes(q) || (KEY_LABELS[k] ?? '').toLowerCase().includes(q)).slice(0, 50)
  }, [query])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', padding: '4px 8px', borderRadius: 5, textAlign: 'left',
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
          color: 'var(--text-primary, #eee)', cursor: 'pointer', fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        {displayKey(value)} <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({value})</span> ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 300,
          background: 'var(--bg-secondary, #1e1e1e)', border: '1px solid var(--border, #444)',
          borderRadius: 8, width: 220, maxHeight: 220, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search key…"
            onKeyDown={e => {
              if (e.key === 'Enter' && filtered.length > 0) { onChange(filtered[0]); setOpen(false); setQuery('') }
              if (e.key === 'Escape') setOpen(false)
            }}
            style={{
              margin: 6, padding: '4px 8px',
              background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border, #3a3a3a)',
              borderRadius: 5, color: 'var(--text-primary, #eee)', fontSize: 11, outline: 'none',
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(k => (
              <div
                key={k}
                onClick={() => { onChange(k); setOpen(false); setQuery('') }}
                style={{
                  padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
                  color: k === value ? 'var(--accent, #7c6aff)' : 'var(--text-secondary, #aaa)',
                  background: k === value ? 'rgba(124,106,255,0.12)' : 'transparent',
                  display: 'flex', gap: 8, alignItems: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = k === value ? 'rgba(124,106,255,0.12)' : 'transparent')}
              >
                <span style={{ minWidth: 28, color: 'var(--text-primary, #eee)' }}>{displayKey(k)}</span>
                <span style={{ color: 'var(--text-muted, #666)', fontSize: 10 }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
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
              background: active ? 'rgba(124,106,255,0.3)' : 'rgba(255,255,255,0.06)',
              border: active ? '1px solid rgba(124,106,255,0.6)' : '1px solid rgba(255,255,255,0.1)',
              color: active ? '#c4baff' : 'var(--text-muted, #888)',
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

export default function MacKeyEditor({ macKey, anchorX, anchorY, onClose }: Props) {
  const { rules, addRule, removeRule } = useKarabinerStore()
  const [mode, setMode] = useState<Mode>('remap')

  // Remap state
  const [toKey, setToKey] = useState(KEY_CODES[0])
  const [toMods, setToMods] = useState<string[]>([])

  // Combo state
  const [comboKeys, setComboKeys] = useState<string[]>([macKey.code])
  const [comboTo, setComboTo] = useState('escape')
  const [comboToMods, setComboToMods] = useState<string[]>([])

  // Layer activate state
  const [layerName, setLayerName] = useState(`layer_${macKey.code.replace(/[^a-z0-9]/g, '_')}`)
  const [tapKey, setTapKey] = useState('')

  // Layer bind state — pick an existing layer activator
  const layerActivators = rules.filter(r => r.type === 'layer_activator') as LayerActivatorRule[]
  const [bindLayerName, setBindLayerName] = useState(layerActivators[0]?.layerName ?? '')
  const [bindTo, setBindTo] = useState(KEY_CODES[0])
  const [bindToMods, setBindToMods] = useState<string[]>([])

  // Existing rules for this key
  const existingRules = rules.filter(r => {
    if (r.type === 'simple') return r.fromKey === macKey.code
    if (r.type === 'combo') return r.fromKeys.includes(macKey.code)
    if (r.type === 'layer_activator') return r.fromKey === macKey.code
    if (r.type === 'layer_binding') return r.fromKey === macKey.code
    return false
  })

  function handleAddRemap() {
    const rule: SimpleRemapRule = {
      type: 'simple',
      description: `${macKey.code} → ${toKey}`,
      fromKey: macKey.code,
      toKey,
      toModifiers: toMods.length > 0 ? toMods : undefined,
    }
    addRule(rule)
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
      type: 'layer_activator',
      description: `${macKey.code} → activate ${layerName}`,
      fromKey: macKey.code,
      layerName: layerName.trim() || `layer_${macKey.code}`,
      tapKey: tapKey || undefined,
    }
    addRule(rule)
    onClose()
  }

  function handleAddLayerBind() {
    if (!bindLayerName) return
    const rule: LayerBindingRule = {
      type: 'layer_binding',
      description: `[${bindLayerName}] ${macKey.code} → ${bindTo}`,
      layerName: bindLayerName,
      fromKey: macKey.code,
      toKey: bindTo,
      toModifiers: bindToMods.length > 0 ? bindToMods : undefined,
    }
    addRule(rule)
    onClose()
  }

  function toggleComboKey(k: string) {
    setComboKeys(prev =>
      prev.includes(k) ? (prev.length > 1 ? prev.filter(x => x !== k) : prev) : [...prev, k]
    )
  }

  // Smart positioning
  const W = 290, MARGIN = 8, APPROX_H = 360
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  let left = anchorX
  if (left + W > vw - MARGIN) left = vw - W - MARGIN
  if (left < MARGIN) left = MARGIN
  const showAbove = anchorY + APPROX_H > vh - MARGIN
  const top = Math.max(MARGIN, showAbove ? anchorY - APPROX_H - 8 : anchorY)

  // Letter keys for combo grid
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

  const MODE_LABELS: Record<Mode, string> = {
    remap: 'Remap',
    combo: 'Combo',
    layer_activate: 'Layer Key',
    layer_bind: 'In Layer',
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={onClose} />
      <div
        style={{ position: 'fixed', left, top, zIndex: 1000, width: W }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          background: 'var(--bg-secondary, #1a1a1a)',
          border: '1px solid var(--border, #3a3a3a)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 12px 8px',
            borderBottom: '1px solid var(--border, #2a2a2a)',
            background: 'rgba(255,255,255,0.02)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #eee)', fontFamily: 'monospace' }}>
              {macKey.label}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted, #666)' }}>{macKey.code}</span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
              {(Object.keys(MODE_LABELS) as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '3px 8px', borderRadius: 20, fontSize: 10, cursor: 'pointer',
                    fontWeight: mode === m ? 700 : 500,
                    background: mode === m ? 'rgba(124,106,255,0.3)' : 'rgba(255,255,255,0.06)',
                    border: mode === m ? '1px solid rgba(124,106,255,0.6)' : '1px solid rgba(255,255,255,0.1)',
                    color: mode === m ? '#c4baff' : 'var(--text-muted, #888)',
                  }}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Existing rules for this key */}
          {existingRules.length > 0 && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border, #2a2a2a)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted, #666)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Current mappings
              </div>
              {existingRules.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)', flex: 1, fontFamily: 'monospace' }}>
                    {r.description}
                  </span>
                  <button
                    onClick={() => removeRule(rules.indexOf(r))}
                    style={{ color: 'var(--text-muted, #666)', padding: 2, borderRadius: 3 }}
                    title="Remove rule"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Content */}
          <div style={{ padding: '12px 12px 10px' }}>
            {mode === 'remap' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', width: 40, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</span>
                  <KeyDropdown value={toKey} onChange={setToKey} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', width: 40, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mods</span>
                  <ModPills selected={toMods} onChange={setToMods} />
                </div>
              </div>
            ) : mode === 'layer_activate' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>
                  Hold <b style={{ color: 'var(--text-secondary, #ccc)' }}>{macKey.label}</b> to activate a layer. Other keys can then bind to this layer.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', width: 56, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Layer name</span>
                  <input
                    value={layerName}
                    onChange={e => setLayerName(e.target.value.replace(/\s/g, '_'))}
                    style={{ flex: 1, padding: '4px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, color: 'var(--text-primary, #eee)', fontSize: 11, fontFamily: 'monospace' }}
                    placeholder="e.g. nav_layer"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', width: 56, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tap key</span>
                  <KeyDropdown value={tapKey || KEY_CODES[0]} onChange={setTapKey} />
                  <button
                    onClick={() => setTapKey('')}
                    style={{ fontSize: 10, color: 'var(--text-muted, #888)', padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                  >none</button>
                </div>
              </div>
            ) : mode === 'layer_bind' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {layerActivators.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#f5a623' }}>
                    No layer keys defined yet. Click another key and choose "Layer Key" first.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', width: 44, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Layer</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {layerActivators.map(la => (
                          <button
                            key={la.layerName}
                            onClick={() => setBindLayerName(la.layerName)}
                            style={{
                              padding: '3px 8px', borderRadius: 20, fontSize: 10, cursor: 'pointer',
                              background: bindLayerName === la.layerName ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.07)',
                              border: bindLayerName === la.layerName ? '1px solid rgba(56,189,248,0.5)' : '1px solid rgba(255,255,255,0.1)',
                              color: bindLayerName === la.layerName ? '#7dd3fc' : 'var(--text-muted, #888)',
                            }}
                          >
                            {la.layerName} ({la.fromKey})
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', width: 44, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</span>
                      <KeyDropdown value={bindTo} onChange={setBindTo} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', width: 44, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mods</span>
                      <ModPills selected={bindToMods} onChange={setBindToMods} />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted, #666)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                          background: active ? 'var(--accent, #7c6aff)' : 'rgba(255,255,255,0.07)',
                          color: active ? '#fff' : 'var(--text-secondary, #aaa)',
                          border: active ? 'none' : '1px solid rgba(255,255,255,0.1)',
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
                      padding: '2px 7px', background: 'var(--accent, #7c6aff)', color: '#fff',
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
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', width: 40, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</span>
                  <KeyDropdown value={comboTo} onChange={setComboTo} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #666)', width: 40, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mods</span>
                  <ModPills selected={comboToMods} onChange={setComboToMods} />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '8px 12px', borderTop: '1px solid var(--border, #2a2a2a)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-secondary, #aaa)',
              }}
            >
              Cancel
            </button>
            <button
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
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: 'var(--accent, #7c6aff)', color: '#fff', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
                opacity: ((mode === 'combo' && comboKeys.length < 2) || (mode === 'layer_bind' && !bindLayerName)) ? 0.5 : 1,
              }}
            >
              <Plus size={11} />
              Add {MODE_LABELS[mode]}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
