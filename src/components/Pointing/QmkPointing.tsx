/**
 * QMK pointing device: the handful of flags that live in the keymap's
 * rules.mk / config.h (enable, driver, rotation, invert, CPI). Files are
 * created next to keymap.c when missing.
 */
import { useEffect, useRef, useState } from 'react'
import { readText, saveText } from '@/lib/io'
import { registerDirtySource, syncDirty } from '@/lib/dirty'
import { ErrorPanel, Field, Switch, useToast } from '@/components/ui'
import { QMK_DRIVERS, applyQmkPointing, parseQmkPointing, type QmkPointing as Model, type Rotation } from '@/lib/pointing/qmk'
import type { KeyboardDef } from '@/lib/registry/types'

export default function QmkPointing({ keyboard }: { keyboard: KeyboardDef }) {
  const toast = useToast()
  const dir = keyboard.keymapCPath ? keyboard.keymapCPath.replace(/\/[^/]+$/, '') : null
  const rulesPath = dir ? `${dir}/rules.mk` : null
  const configPath = dir ? `${dir}/config.h` : null
  const [files, setFiles] = useState<{ rules: string; config: string } | null>(null)
  const [orig, setOrig] = useState<Model | null>(null)
  const [model, setModel] = useState<Model | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!rulesPath || !configPath) return
    setError(null)
    try {
      const [rules, config] = await Promise.all([readText(rulesPath).catch(() => ''), readText(configPath).catch(() => '')])
      setFiles({ rules, config })
      const m = parseQmkPointing(rules, config)
      setOrig(m); setModel(m)
    } catch (e) { setError(String(e)) }
  }
  useEffect(() => { load() }, [keyboard.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!(orig && model && JSON.stringify(orig) !== JSON.stringify(model))
  const dirtyRef = useRef(false); dirtyRef.current = dirty
  const saveRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => registerDirtySource('pointing-qmk', () => dirtyRef.current, () => saveRef.current(), () => load()), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { syncDirty() }, [dirty])

  const save = async (rethrow = false) => {
    if (!files || !orig || !model || !rulesPath || !configPath) return
    try {
      const out = applyQmkPointing(files.rules, files.config, orig, model)
      if (out.rules !== files.rules) await saveText(rulesPath, out.rules)
      if (out.config !== files.config) {
        try { await saveText(configPath, out.config) } catch (e) {
          // keep the pair consistent: put rules.mk back when config.h could not be written
          if (out.rules !== files.rules) await saveText(rulesPath, files.rules).catch(() => {})
          throw e
        }
      }
      setFiles(out)
      const m = parseQmkPointing(out.rules, out.config)
      setOrig(m); setModel(m)
      toast.success('Saved — run `qmk compile` and flash to apply')
    } catch (e) { toast.error(`Not saved: ${e}`); if (rethrow) throw e }
  }
  saveRef.current = () => save(true)
  const set = <K extends keyof Model>(k: K, v: Model[K]) => setModel(m => (m ? { ...m, [k]: v } : m))

  if (!dir) {
    return <ErrorPanel>This QMK keyboard was added from a VIA layout export only. Add it from its keyboard source folder (the one with keymaps/&lt;name&gt;/keymap.c) to manage pointing flags.</ErrorPanel>
  }
  if (error) return <ErrorPanel onRetry={load}>{error}</ErrorPanel>
  if (!model) return <div className="skeleton" style={{ height: 120 }} />

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Editing <span className="mono">{dir.split('/').slice(-3).join('/')}/</span> rules.mk + config.h</span>
        <span style={{ flex: 1 }} />
        {dirty && <span className="tag" style={{ background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.25)', color: 'var(--warning)' }}>Unsaved</span>}
        <button className="btn btn-primary btn-sm" onClick={() => save()} disabled={!dirty}>Save</button>
      </div>
      <div className="glass anim-fade-up" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Pointing device</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>POINTING_DEVICE_ENABLE in rules.mk</span>
          </span>
          <Switch checked={model.enabled} onChange={v => set('enabled', v)} aria-label="Pointing device enabled" />
        </div>
        <Field label="Driver" hint="POINTING_DEVICE_DRIVER">
          <select value={model.driver ?? ''} onChange={e => set('driver', e.target.value || null)} aria-label="Pointing driver" disabled={!model.enabled}>
            <option value="">— none —</option>
            {QMK_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
            {model.driver && !(QMK_DRIVERS as readonly string[]).includes(model.driver) && <option value={model.driver}>{model.driver}</option>}
          </select>
        </Field>
        <Field label="Rotation" hint="POINTING_DEVICE_ROTATION_*">
          <div className="seg-ctrl">
            {([0, 90, 180, 270] as Rotation[]).map(r => (
              <button key={r} className={`seg-btn${model.rotation === r ? ' active' : ''}`} onClick={() => set('rotation', r)} disabled={!model.enabled}>{r}°</button>
            ))}
          </div>
        </Field>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Invert X <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>POINTING_DEVICE_INVERT_X</span></span>
          <Switch checked={model.invertX} onChange={v => set('invertX', v)} aria-label="Invert X" disabled={!model.enabled} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Invert Y <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>POINTING_DEVICE_INVERT_Y</span></span>
          <Switch checked={model.invertY} onChange={v => set('invertY', v)} aria-label="Invert Y" disabled={!model.enabled} />
        </div>
        <Field label="CPI" hint={model.cpiDefine ?? 'PMW33XX_CPI (set when non-empty)'}>
          <input
            className="mono" inputMode="numeric" placeholder="e.g. 1600"
            value={model.cpi ?? ''} disabled={!model.enabled}
            onChange={e => { const v = e.target.value.trim(); set('cpi', v === '' ? null : /^\d+$/.test(v) ? parseInt(v, 10) : model.cpi) }}
            aria-label="CPI"
          />
        </Field>
      </div>
    </div>
  )
}
