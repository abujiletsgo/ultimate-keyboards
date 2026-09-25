/**
 * Behaviors tab: the keymap's user-defined behaviors and macros, with typed
 * forms for the common kinds (hold-tap, mod-morph, tap-dance, sticky-key,
 * caps-word, macro) and a raw property list for everything else. All edits go
 * through zmkStore.editSource, so undo/redo, dirty tracking and validated
 * saves apply.
 */
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useZMKStore } from '@/stores/zmkStore'
import { parseBehaviors, setBehaviorProp, addBehavior, removeBehavior, splitCells, joinCells, intValue, stringValue, type ZmkBehavior } from '@/lib/dt/behaviors'
import { ConfirmBanner, DeleteButton, Field, useToast } from '@/components/ui'

const KINDS: { kind: string; compatible: string; label: string; defaults: { name: string; value: string }[] }[] = [
  { kind: 'hold-tap', compatible: 'zmk,behavior-hold-tap', label: 'Hold-tap', defaults: [
    { name: '#binding-cells', value: '<2>' }, { name: 'bindings', value: '<&kp>, <&kp>' }, { name: 'flavor', value: '"balanced"' }, { name: 'tapping-term-ms', value: '<200>' }, { name: 'quick-tap-ms', value: '<150>' } ] },
  { kind: 'mod-morph', compatible: 'zmk,behavior-mod-morph', label: 'Mod-morph', defaults: [
    { name: '#binding-cells', value: '<0>' }, { name: 'bindings', value: '<&kp A>, <&kp B>' }, { name: 'mods', value: '<(MOD_LSFT|MOD_RSFT)>' } ] },
  { kind: 'tap-dance', compatible: 'zmk,behavior-tap-dance', label: 'Tap-dance', defaults: [
    { name: '#binding-cells', value: '<0>' }, { name: 'tapping-term-ms', value: '<200>' }, { name: 'bindings', value: '<&kp A>, <&kp B>' } ] },
  { kind: 'sticky-key', compatible: 'zmk,behavior-sticky-key', label: 'Sticky key', defaults: [
    { name: '#binding-cells', value: '<1>' }, { name: 'bindings', value: '<&kp>' }, { name: 'release-after-ms', value: '<1000>' } ] },
  { kind: 'caps-word', compatible: 'zmk,behavior-caps-word', label: 'Caps word', defaults: [
    { name: '#binding-cells', value: '<0>' }, { name: 'continue-list', value: '<UNDERSCORE MINUS>' } ] },
  { kind: 'macro', compatible: 'zmk,behavior-macro', label: 'Macro', defaults: [
    { name: '#binding-cells', value: '<0>' }, { name: 'bindings', value: '<&kp H>, <&kp I>' } ] },
]

const FLAVORS = ['balanced', 'tap-preferred', 'hold-preferred', 'tap-unless-interrupted']
const MODS = ['MOD_LSFT', 'MOD_RSFT', 'MOD_LCTL', 'MOD_RCTL', 'MOD_LALT', 'MOD_RALT', 'MOD_LGUI', 'MOD_RGUI']

const inputStyle = { height: 28, fontSize: 12, fontFamily: 'var(--font-mono)' } as const

export default function BehaviorsEditor() {
  const keymap = useZMKStore(s => s.keymap)
  const editSource = useZMKStore(s => s.editSource)
  const toast = useToast()
  const [adding, setAdding] = useState<string | null>(null) // kind
  const [newLabel, setNewLabel] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const doc = useMemo(() => keymap ? parseBehaviors(keymap.rawSource) : null, [keymap])
  if (!keymap || !doc) return null

  const run = (mutate: (s: string) => string, okMsg?: string) => {
    const err = editSource(mutate)
    if (err) toast.error(err); else if (okMsg) toast.success(okMsg)
  }
  const setProp = (label: string, name: string, value: string | null) => run(s => setBehaviorProp(s, label, name, value))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Behaviors ({doc.behaviors.length})</h3>
        <span style={{ flex: 1 }} />
        <select value={adding ?? ''} onChange={e => { setAdding(e.target.value || null); setNewLabel('') }} style={{ height: 30 }} aria-label="Add a behavior of type">
          <option value="">Add…</option>
          {KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
      </div>

      {adding && (() => {
        const kd = KINDS.find(k => k.kind === adding)!
        const valid = /^[a-z_][a-z0-9_]*$/.test(newLabel) && !doc.behaviors.some(b => b.label === newLabel)
        return (
          <div className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>New {kd.label}</div>
            <Field label="Label (used as &label in the keymap)">
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder={kd.kind === 'macro' ? 'my_macro' : 'hml'} style={{ ...inputStyle, width: 220 }} aria-invalid={newLabel !== '' && !valid} />
            </Field>
            {newLabel !== '' && !valid && <span style={{ fontSize: 11, color: 'var(--danger)' }}>Lower-case letters, digits and _ only, and not already in use.</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={!valid} onClick={() => {
                run(s => addBehavior(s, { label: newLabel, compatible: kd.compatible, props: kd.defaults }), `Added ${newLabel}`)
                setAdding(null); setOpen(newLabel)
              }}><Plus size={13} /> Add</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(null)}>Cancel</button>
            </div>
          </div>
        )
      })()}

      {confirmRemove && (
        <ConfirmBanner danger message={<>Remove behavior <strong>&{confirmRemove}</strong>? Keys still bound to it will fail to build until rebound.</>} confirmLabel="Remove"
          onConfirm={() => { run(s => removeBehavior(s, confirmRemove), `Removed ${confirmRemove}`); setConfirmRemove(null) }} onCancel={() => setConfirmRemove(null)} />
      )}

      {doc.behaviors.length === 0 && !adding && (
        <div className="panel-inset" style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          No user behaviors yet. Add a hold-tap, mod-morph, tap-dance, sticky key or macro above; it then appears in the key editor as <code className="mono">&amp;label</code>.
        </div>
      )}

      {doc.behaviors.map(b => (
        <BehaviorRow key={b.label} b={b} open={open === b.label} onToggle={() => setOpen(open === b.label ? null : b.label)} setProp={setProp} onRemove={() => setConfirmRemove(b.label)} />
      ))}
    </div>
  )
}

function BehaviorRow({ b, open, onToggle, setProp, onRemove }: { b: ZmkBehavior; open: boolean; onToggle: () => void; setProp: (label: string, name: string, value: string | null) => void; onRemove: () => void }) {
  const p = (name: string) => b.props.find(x => x.name === name)
  const summary = (() => {
    const bind = p('bindings')?.value
    const cells = bind ? splitCells(bind) : []
    switch (b.kind) {
      case 'hold-tap': return `hold ${cells[0] ?? '?'} · tap ${cells[1] ?? '?'} · ${stringValue(p('flavor')) ?? 'balanced'} · ${intValue(p('tapping-term-ms')) ?? '?'} ms`
      case 'mod-morph': return `${cells[0] ?? '?'} → ${cells[1] ?? '?'} with ${p('mods')?.value ?? '?'}`
      case 'tap-dance': return `${cells.length} taps: ${cells.join(' / ')}`
      case 'macro': return `${cells.length} steps: ${cells.slice(0, 4).join(', ')}${cells.length > 4 ? '…' : ''}`
      default: return b.compatible
    }
  })()
  return (
    <div className="panel-inset" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-ghost btn-sm" aria-expanded={open} onClick={onToggle} style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>&{b.label}</button>
        <span className="tag">{b.kind}</span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={summary}>{summary}</span>
        <DeleteButton label={`Remove behavior ${b.label}`} onClick={onRemove} />
      </div>
      {open && <BehaviorForm b={b} setProp={setProp} />}
    </div>
  )
}

function CellsEditor({ label, value, onChange, fixed }: { label: string; value: string; onChange: (v: string) => void; fixed?: number }) {
  const cells = splitCells(value)
  const set = (i: number, v: string) => { const n = [...cells]; n[i] = v; onChange(joinCells(n)) }
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {cells.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 18, textAlign: 'right' }}>{i + 1}</span>
            <input value={c} onChange={e => set(i, e.target.value)} style={{ ...inputStyle, flex: 1 }} aria-label={`${label} ${i + 1}`} />
            {!fixed && cells.length > 1 && <button className="btn btn-ghost btn-sm" aria-label="Remove step" onClick={() => onChange(joinCells(cells.filter((_, j) => j !== i)))}>×</button>}
          </div>
        ))}
        {!fixed && <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange(joinCells([...cells, '&kp A']))}><Plus size={12} /> Step</button>}
      </div>
    </Field>
  )
}

function IntField({ b, name, label, setProp, hint }: { b: ZmkBehavior; name: string; label: string; setProp: (l: string, n: string, v: string | null) => void; hint?: string }) {
  const v = intValue(b.props.find(p => p.name === name))
  return (
    <Field label={label} hint={hint}>
      <input type="number" value={v ?? ''} placeholder="default" onChange={e => setProp(b.label, name, e.target.value === '' ? null : `<${parseInt(e.target.value, 10) || 0}>`)} style={{ ...inputStyle, width: 110 }} />
    </Field>
  )
}

function FlagField({ b, name, label, setProp }: { b: ZmkBehavior; name: string; label: string; setProp: (l: string, n: string, v: string | null) => void }) {
  const on = b.props.some(p => p.name === name)
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <input type="checkbox" checked={on} onChange={e => setProp(b.label, name, e.target.checked ? '' : null)} /> {label}
    </label>
  )
}

function BehaviorForm({ b, setProp }: { b: ZmkBehavior; setProp: (l: string, n: string, v: string | null) => void }) {
  const p = (name: string) => b.props.find(x => x.name === name)
  const bindings = p('bindings')?.value ?? ''
  const known = new Set(['compatible', '#binding-cells', 'bindings', 'flavor', 'tapping-term-ms', 'quick-tap-ms', 'require-prior-idle-ms', 'hold-trigger-key-positions', 'hold-trigger-on-release', 'mods', 'keep-mods', 'release-after-ms', 'quick-release', 'ignore-modifiers', 'lazy', 'continue-list', 'wait-ms', 'tap-ms', 'label'])
  const other = b.props.filter(x => !known.has(x.name))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
      {b.kind === 'hold-tap' && (
        <>
          <CellsEditor label="Bindings (hold, tap) — behaviors without params, e.g. &kp" value={bindings} onChange={v => setProp(b.label, 'bindings', v)} fixed={2} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Field label="Flavor">
              <select value={stringValue(p('flavor')) ?? ''} onChange={e => setProp(b.label, 'flavor', e.target.value ? `"${e.target.value}"` : null)} style={{ height: 28 }}>
                <option value="">default (hold-preferred)</option>
                {FLAVORS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <IntField b={b} name="tapping-term-ms" label="Tapping term (ms)" setProp={setProp} />
            <IntField b={b} name="quick-tap-ms" label="Quick tap (ms)" setProp={setProp} />
            <IntField b={b} name="require-prior-idle-ms" label="Prior idle (ms)" setProp={setProp} />
          </div>
          <Field label="Hold-trigger key positions (space-separated, optional)">
            <input value={(p('hold-trigger-key-positions')?.value ?? '').replace(/[<>]/g, '').trim()} placeholder="e.g. 6 7 8 9 10 11"
              onChange={e => setProp(b.label, 'hold-trigger-key-positions', e.target.value.trim() ? `<${e.target.value.trim()}>` : null)} style={{ ...inputStyle, width: '100%' }} />
          </Field>
          <FlagField b={b} name="hold-trigger-on-release" label="hold-trigger-on-release" setProp={setProp} />
        </>
      )}
      {b.kind === 'mod-morph' && (
        <>
          <CellsEditor label="Bindings (default, morphed)" value={bindings} onChange={v => setProp(b.label, 'bindings', v)} fixed={2} />
          <ModsField b={b} name="mods" label="Morph when any of these mods is held" setProp={setProp} />
          <ModsField b={b} name="keep-mods" label="Keep these mods when morphing (optional)" setProp={setProp} />
        </>
      )}
      {b.kind === 'tap-dance' && (
        <>
          <CellsEditor label="Bindings per tap count" value={bindings} onChange={v => setProp(b.label, 'bindings', v)} />
          <IntField b={b} name="tapping-term-ms" label="Tapping term (ms)" setProp={setProp} />
        </>
      )}
      {b.kind === 'sticky-key' && (
        <>
          <CellsEditor label="Binding" value={bindings} onChange={v => setProp(b.label, 'bindings', v)} fixed={1} />
          <IntField b={b} name="release-after-ms" label="Release after (ms)" setProp={setProp} />
          <FlagField b={b} name="quick-release" label="quick-release" setProp={setProp} />
          <FlagField b={b} name="ignore-modifiers" label="ignore-modifiers" setProp={setProp} />
          <FlagField b={b} name="lazy" label="lazy" setProp={setProp} />
        </>
      )}
      {b.kind === 'caps-word' && (
        <Field label="Continue list (keycodes that don't end caps word)">
          <input value={(p('continue-list')?.value ?? '').replace(/[<>]/g, '').trim()} onChange={e => setProp(b.label, 'continue-list', e.target.value.trim() ? `<${e.target.value.trim()}>` : null)} style={{ ...inputStyle, width: '100%' }} />
        </Field>
      )}
      {b.kind === 'macro' && (
        <>
          <CellsEditor label="Steps (in order)" value={bindings} onChange={v => setProp(b.label, 'bindings', v)} />
          <div style={{ display: 'flex', gap: 12 }}>
            <IntField b={b} name="wait-ms" label="Wait between steps (ms)" setProp={setProp} />
            <IntField b={b} name="tap-ms" label="Tap duration (ms)" setProp={setProp} />
          </div>
        </>
      )}
      {other.length > 0 && (
        <Field label="Other properties (raw)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {other.map(x => (
              <div key={x.name} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 11, minWidth: 140 }}>{x.name}</span>
                <input value={x.value} onChange={e => setProp(b.label, x.name, e.target.value)} style={{ ...inputStyle, flex: 1 }} aria-label={x.name} />
              </div>
            ))}
          </div>
        </Field>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>compatible = {b.compatible}{b.bindingCells !== null ? ` · #binding-cells = ${b.bindingCells}` : ''}</div>
    </div>
  )
}

function ModsField({ b, name, label, setProp }: { b: ZmkBehavior; name: string; label: string; setProp: (l: string, n: string, v: string | null) => void }) {
  const raw = b.props.find(p => p.name === name)?.value ?? ''
  const selected = new Set(MODS.filter(m => raw.includes(m)))
  const toggle = (m: string) => {
    const n = new Set(selected); if (n.has(m)) n.delete(m); else n.add(m)
    setProp(b.label, name, n.size ? `<(${[...n].join('|')})>` : null)
  }
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {MODS.map(m => (
          <button key={m} type="button" className="pill" aria-pressed={selected.has(m)} onClick={() => toggle(m)}
            style={{ padding: '3px 8px', borderRadius: 'var(--r-pill)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-mono)',
              background: selected.has(m) ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.06)',
              border: selected.has(m) ? '1px solid rgba(45,212,191,0.6)' : '1px solid rgba(255,255,255,0.1)',
              color: selected.has(m) ? 'var(--accent-hover)' : 'var(--text-muted)' }}>{m.replace('MOD_', '')}</button>
        ))}
      </div>
    </Field>
  )
}
