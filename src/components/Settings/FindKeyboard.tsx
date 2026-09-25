/**
 * "Find my keyboard": searchable catalogue for people who just bought a
 * keyboard. Pick one → see its layout and default keymap → start from it:
 * ZMK creates a config repo on the user's GitHub; QMK saves a keymap.json.
 */
import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { mkdir, writeTextFile } from '@tauri-apps/plugin-fs'
import { documentDir, join } from '@tauri-apps/api/path'
import { ArrowLeft, Search } from 'lucide-react'
import MiniLayout from '@/components/board/MiniLayout'
import PhysicalBoard from '@/components/board/PhysicalBoard'
import { ErrorPanel, Switch } from '@/components/ui'
import {
  CATALOGUE_ITEMS, EMPTY_FILTER, RELIABILITY_LABEL, TAG_LABEL, filterCatalogue,
  type CatalogueFilter, type CatalogueItem, type Tag,
} from '@/lib/catalogue'
import { qmkDefaultKeymap, qmkKeyboardDetails, type QmkKeyboardDetails, type QmkConfiguratorKeymap } from '@/lib/catalogue/qmk'
import { buildYaml, confText, controllersFor, keymapFileName, needsUnlockOff, pinWestToMain } from '@/lib/catalogue/newZmkConfig'
import { parseKeymapText } from '@/lib/zmkParser'
import { bindingLabel, bindingSubLabel } from '@/lib/keyLabel'
import { abbreviateQMK } from '@/components/ZMKEditor/QMKKeyboard'
import { IS_TAURI, readText, saveText } from '@/lib/io'
import type { KeyboardDef } from '@/lib/registry/types'
import type { PhysicalLayout } from '@/lib/layout'

interface Props {
  onAdd: (def: Omit<KeyboardDef, 'id' | 'createdAt'>) => void
}

const TAGS: Tag[] = ['trackball', 'trackpad', 'rgb', 'display', 'encoder', 'studio']

export default function FindKeyboard({ onAdd }: Props) {
  const [filter, setFilter] = useState<CatalogueFilter>(EMPTY_FILTER)
  const [picked, setPicked] = useState<CatalogueItem | null>(null)
  const results = useMemo(() => filterCatalogue(CATALOGUE_ITEMS, filter), [filter])
  const toggleTag = (t: Tag) => setFilter(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }))

  if (picked) return <Detail item={picked} onBack={() => setPicked(null)} onAdd={onAdd} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }} />
        <input
          autoFocus value={filter.query} onChange={e => setFilter(f => ({ ...f, query: e.target.value }))}
          placeholder="Search: corne, sofle, 42, charybdis…" aria-label="Search keyboards"
          style={{ width: '100%', paddingLeft: 30 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="seg-ctrl" role="radiogroup" aria-label="Firmware">
          {(['any', 'zmk', 'qmk'] as const).map(fw => (
            <button key={fw} role="radio" aria-checked={filter.firmware === fw} className={`seg-btn${filter.firmware === fw ? ' active' : ''}`} onClick={() => setFilter(f => ({ ...f, firmware: fw }))}>
              {fw === 'any' ? 'Any firmware' : fw.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="pill-btn" aria-pressed={filter.splitOnly} onClick={() => setFilter(f => ({ ...f, splitOnly: !f.splitOnly }))}>Split only</button>
        {TAGS.map(t => <button key={t} className="pill-btn" aria-pressed={filter.tags.includes(t)} onClick={() => toggleTag(t)}>{TAG_LABEL[t]}</button>)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{results.length} keyboard{results.length === 1 ? '' : 's'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {results.map(i => (
          <button key={i.key} className="card-btn" onClick={() => setPicked(i)}>
            <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i.zmk ? <MiniLayout layout={i.zmk.layout} width={170} /> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Layout loads from QMK</span>}
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{i.name}</span>
              <span className={`fw-badge fw-${i.firmware}`}>{i.firmware.toUpperCase()}</span>
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {i.keyCount ? `${i.keyCount} keys` : 'keys: see details'}{i.split ? ' · split' : ''}{i.tags.length ? ` · ${i.tags.map(t => TAG_LABEL[t]).join(', ')}` : ''}
            </span>
          </button>
        ))}
      </div>
      {results.length === 0 && (
        <div className="panel-inset" style={{ padding: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
          Nothing matches. Try fewer filters, or add your keyboard from its config folder if you already have one.
        </div>
      )}
    </div>
  )
}

// ── detail: preview + start ──────────────────────────────────────────────────

function Detail({ item, onBack, onAdd }: { item: CatalogueItem; onBack: () => void; onAdd: Props['onAdd'] }) {
  const [layer, setLayer] = useState(0)
  const [qmk, setQmk] = useState<{ details: QmkKeyboardDetails; keymap: QmkConfiguratorKeymap | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!item.qmkPath) return
    Promise.all([qmkKeyboardDetails(item.qmkPath), qmkDefaultKeymap(item.qmkPath)])
      .then(([details, keymap]) => setQmk({ details, keymap }))
      .catch(e => setError(String(e instanceof Error ? e.message : e)))
  }, [item.qmkPath])

  // what to draw
  const view = useMemo((): { layout: PhysicalLayout; layers: { name: string; keys: { label: string; sub?: string; title: string }[] }[] } | null => {
    if (item.zmk) {
      const k = item.zmk
      if (!k.keymapPreview) return { layout: k.layout, layers: [] }
      const km = parseKeymapText(k.keymap)
      return {
        layout: k.layout,
        layers: km.layers.map(l => ({ name: l.name, keys: l.keys.map(b => ({ label: bindingLabel(b), sub: bindingSubLabel(b), title: b })) })),
      }
    }
    if (qmk) {
      const want = qmk.keymap?.layout
      const chosen = qmk.details.layouts.find(l => l.id === want) ?? qmk.details.layouts[0]
      if (!chosen) return null
      const layers = qmk.keymap && qmk.keymap.layers[0]?.length === chosen.layout.keys.length
        ? qmk.keymap.layers.map((l, i) => ({ name: `Layer ${i}`, keys: l.map(kc => ({ label: abbreviateQMK(kc), title: kc })) }))
        : []
      return { layout: { ...chosen.layout, name: `${qmk.details.name} · ${chosen.id}` }, layers }
    }
    return null
  }, [item, qmk])

  const rel = RELIABILITY_LABEL[item.reliability]
  const tags = item.qmkPath && qmk ? qmkTags(qmk.details) : item.tags.map(t => TAG_LABEL[t])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={13} /> All keyboards</button>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{item.name}</span>
        <span className={`fw-badge fw-${item.firmware}`}>{item.firmware.toUpperCase()}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="tag" title={rel.hint}>{rel.label}</span>
        {tags.map(t => <span key={t} className="tag">{t}</span>)}
      </div>
      <div className="panel-inset" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, borderColor: 'rgba(251,191,36,0.3)' }}>
        <strong style={{ color: 'var(--text)' }}>This is the maker’s default, not necessarily what is on your keyboard.</strong>{' '}
        Kits and pre-built boards often differ (extra keys, a trackball, a different controller). If your keyboard already has
        firmware with ZMK Studio, Vial or VIA, plug it in with a USB cable and use <em>Plugged in</em> instead: that reads what is actually installed.
      </div>

      {error && <ErrorPanel>{error}</ErrorPanel>}
      {!view && !error && <div className="skeleton" style={{ height: 180 }} />}
      {view && (
        <div className="glass" style={{ padding: 12 }}>
          {view.layers.length > 1 && (
            <div className="seg-ctrl" role="tablist" aria-label="Layers" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
              {view.layers.map((l, i) => (
                <button key={i} role="tab" aria-selected={layer === i} className={`seg-btn${layer === i ? ' active' : ''}`} onClick={() => setLayer(i)}>{i} {l.name}</button>
              ))}
            </div>
          )}
          <PhysicalBoard
            layout={view.layout}
            editable={false}
            maxScale={0.9}
            label={`${item.name} default keymap`}
            keyAt={pos => {
              const k = view.layers[Math.min(layer, view.layers.length - 1)]?.keys[pos]
              return k ? { label: k.label, sub: k.sub, title: k.title } : { label: '', text: 'rgba(226,230,255,0.3)' }
            }}
          />
          {view.layers.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              The default keymap cannot be previewed here (it is written with macros), but it is still used when you start from this keyboard.
            </div>
          )}
        </div>
      )}

      {item.zmk && <CreateZmkConfig item={item} onAdd={onAdd} />}
      {item.qmkPath && qmk && view && <SaveQmkKeymap item={item} qmk={qmk} layout={view.layout} onAdd={onAdd} />}
    </div>
  )
}

function qmkTags(d: QmkKeyboardDetails): string[] {
  const t: string[] = []
  if (d.split) t.push('Split')
  if (d.features.includes('rgb_matrix') || d.features.includes('rgblight')) t.push('RGB')
  if (d.features.includes('oled')) t.push('Display')
  if (d.features.includes('encoder')) t.push('Knob')
  if (d.features.includes('pointing_device')) t.push('Pointing device')
  return t
}

// ── ZMK: create a config repo ───────────────────────────────────────────────

function CreateZmkConfig({ item, onAdd }: { item: CatalogueItem; onAdd: Props['onAdd'] }) {
  const kb = item.zmk!
  const controllers = controllersFor(kb)
  const [name, setName] = useState(`zmk-config-${kb.id.replace(/\/\/.*$/, '').replace(/_/g, '-')}`)
  const [priv, setPriv] = useState(false)
  const [controller, setController] = useState(controllers[0]?.id ?? '')
  const [studio, setStudio] = useState(kb.studio)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const validName = /^[A-Za-z0-9._-]{1,100}$/.test(name) && !name.startsWith('-') && name !== '.' && name !== '..'

  const create = async () => {
    setError(null)
    try {
      setStep('Creating the repository on GitHub…')
      const created = await invoke<{ github: string; path: string }>('create_zmk_config', { name, private: priv })
      setStep('Writing your keyboard’s files…')
      const ctl = controllers.find(c => c.id === controller) ?? null
      const cfg = await join(created.path, 'config')
      const keymapPath = await join(cfg, keymapFileName(kb))
      // a fresh clone: plain writes, so no .bak files end up in the first commit
      await writeTextFile(await join(created.path, 'build.yaml'), buildYaml({ keyboard: kb, controller: ctl, studio }))
      await writeTextFile(keymapPath, kb.keymap)
      await writeTextFile(keymapPath.replace(/\.keymap$/, '.conf'), confText(kb))
      const westPath = await join(cfg, 'west.yml')
      await writeTextFile(westPath, pinWestToMain(await readText(westPath)))
      setStep('Uploading to GitHub (this starts the first firmware build)…')
      await invoke('push_initial_config', { repo: created.path, message: `Start from the ${kb.name} default keymap (Ultimate Keyboards)` })
      onAdd({
        name: kb.name, firmware: 'zmk', repoPath: created.path, keymapPath, shield: kb.id.replace(/\/\/.*$/, ''),
        layout: kb.layout, pointing: [],
      })
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally { setStep(null) }
  }

  if (!IS_TAURI) return <div className="panel-inset" style={{ padding: 12, fontSize: 12 }}>Creating a config needs the desktop app.</div>
  return (
    <div className="glass" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Start customizing</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        ZMK keyboards are built from a config on GitHub. This creates one on <strong>your</strong> GitHub account from ZMK’s official template, with this keyboard’s default keymap, and keeps a copy in Documents. GitHub then builds the firmware for you; the Build tab downloads and flashes it.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Repository name</span>
          <input value={name} onChange={e => setName(e.target.value)} className="mono" aria-invalid={!validName} />
          {!validName && <span style={{ color: 'var(--danger)', fontSize: 11 }}>Letters, numbers, - _ . only</span>}
        </label>
        {controllers.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Controller on each half</span>
            <select value={controller} onChange={e => setController(e.target.value)}>
              {controllers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <Switch checked={priv} onChange={setPriv} label="Private repository" description="Public is the ZMK norm and lets others help you; private works too." />
      {kb.studio && (
        <Switch
          checked={studio} onChange={setStudio} label="Enable live editing (ZMK Studio)"
          description={needsUnlockOff(kb)
            ? 'Adds Studio to the left half so this app can read and change the keymap over USB without rebuilding. This keymap has no Studio unlock key, so the Studio lock is turned off: any app on a computer you plug into can change the keymap.'
            : 'Adds Studio to the left half so this app can read and change the keymap over USB without rebuilding. Press the keymap’s Studio unlock key before editing.'}
        />
      )}
      {error && <ErrorPanel onRetry={create}>{error}</ErrorPanel>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={create} disabled={!validName || !!step}>
          {step ? 'Working…' : 'Create my config'}
        </button>
        {step && <span role="status" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{step}</span>}
        {!step && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Needs the GitHub CLI signed in (<span className="mono">gh auth login</span>).</span>}
      </div>
    </div>
  )
}

// ── QMK: save a keymap.json ──────────────────────────────────────────────────

function SaveQmkKeymap({ item, qmk, layout, onAdd }: { item: CatalogueItem; qmk: { details: QmkKeyboardDetails; keymap: QmkConfiguratorKeymap | null }; layout: PhysicalLayout; onAdd: Props['onAdd'] }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true); setError(null)
    try {
      const dir = await join(await documentDir(), `qmk-${item.qmkPath!.replace(/\//g, '-')}`)
      await mkdir(dir, { recursive: true })
      const path = await join(dir, 'keymap.json')
      const layers = qmk.keymap?.layers ?? [layout.keys.map(() => 'KC_NO')]
      const body = { keyboard: item.qmkPath, keymap: 'ultimate-keyboards', layout: qmk.keymap?.layout ?? layout.name, layers }
      await saveText(path, JSON.stringify(body, null, 2) + '\n')
      onAdd({ name: item.name, firmware: 'qmk', keymapPath: path, shield: item.qmkPath, layout, pointing: [] })
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) } finally { setBusy(false) }
  }
  return (
    <div className="glass" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Start customizing</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Saves the default keymap as <span className="mono">keymap.json</span> in Documents so you can edit it here.
        To put it on the keyboard, compile it with <span className="mono">qmk compile keymap.json</span> or QMK Configurator.
        If your keyboard runs VIA or Vial, plugging it in lets you change keys live instead.
      </div>
      {error && <ErrorPanel onRetry={save}>{error}</ErrorPanel>}
      <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save keymap and open it'}</button>
    </div>
  )
}
