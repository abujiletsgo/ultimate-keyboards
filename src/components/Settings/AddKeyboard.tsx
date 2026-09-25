/**
 * Add-keyboard flow: pick a config folder (or a single .keymap), detect what
 * it contains, let the user confirm name / keymap / layout, then register.
 */
import { useEffect, useMemo, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readText } from '@/lib/io'
import { parseKeymapText, isDevicetreeReady } from '@/lib/zmkParser'
import { detectKeyboard, type DetectedKeyboard, type LayoutCandidate } from '@/lib/registry/detect'
import { CATALOGUE, catalogueLabel, catalogueByKeyCount, findCatalogueLayout } from '@/lib/layout/catalogue'
import { gridLayoutFromTransform, type PhysicalLayout } from '@/lib/layout'
import type { KeyboardDef } from '@/lib/registry/types'
import PhysicalBoard from '@/components/board/PhysicalBoard'

interface Props {
  mode: 'folder' | 'file'
  existingNames: string[]
  onAdd: (def: Omit<KeyboardDef, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

function fallbackGrid(keyCount: number, name: string): PhysicalLayout {
  const cols = keyCount <= 40 ? 10 : keyCount <= 48 ? 12 : keyCount <= 70 ? 14 : 16
  const rows = Math.ceil(keyCount / cols)
  const map: [number, number][] = []
  for (let i = 0; i < keyCount; i++) map.push([Math.floor(i / cols), i % cols])
  return { ...gridLayoutFromTransform({ label: name, rows, columns: cols, map }), name: `${cols}-column grid`, source: 'matrix-grid' }
}

/** A keymap inside `<repo>/config/` belongs to `<repo>`; anywhere else there is no known config repo. */
function repoOfKeymap(file: string): string | undefined {
  const dir = file.slice(0, file.lastIndexOf('/'))
  return dir.endsWith('/config') ? dir.slice(0, -'/config'.length) : undefined
}

export default function AddKeyboard({ mode, existingNames, onAdd, onCancel }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detected, setDetected] = useState<DetectedKeyboard | null>(null)
  const [name, setName] = useState('')
  const [keymapPath, setKeymapPath] = useState('')
  const [keyCount, setKeyCount] = useState<number | null>(null)
  const [layoutIdx, setLayoutIdx] = useState(0)
  const [candidates, setCandidates] = useState<LayoutCandidate[]>([])

  const pick = async () => {
    setBusy(true); setError(null)
    try {
      if (mode === 'folder') {
        const dir = await open({ directory: true, recursive: true, multiple: false, title: 'Choose a keyboard config folder' })
        if (!dir || Array.isArray(dir)) { onCancel(); return }
        const d = await detectKeyboard(dir)
        if (!d) { setError('No keymap found in that folder. Expected a ZMK config repo (with config/*.keymap) or a QMK keymap folder with a VIA layout JSON.'); return }
        setDetected(d)
        setName(d.suggestedName)
        setKeymapPath(d.keymapCandidates[0] ?? '')
        setCandidates(d.layoutCandidates)
      } else {
        const file = await open({ multiple: false, filters: [{ name: 'ZMK keymap', extensions: ['keymap'] }], title: 'Choose a .keymap file' })
        if (!file || Array.isArray(file)) { onCancel(); return }
        const base = file.split('/').pop()!.replace(/\.keymap$/, '')
        const d: DetectedKeyboard = {
          firmware: 'zmk', repoPath: repoOfKeymap(file), suggestedName: base.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          shield: base, keymapCandidates: [file], layoutCandidates: [], pointing: [], notes: [],
        }
        const cat = findCatalogueLayout(base)
        if (cat) d.layoutCandidates.push({ label: `Catalogue · ${cat.board} ${cat.displayName}`, layout: cat.layout })
        setDetected(d)
        setName(d.suggestedName)
        setKeymapPath(file)
        setCandidates(d.layoutCandidates)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { pick() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [])

  // Key count from the chosen keymap → catalogue suggestions + grid fallback.
  useEffect(() => {
    if (!detected || detected.firmware !== 'zmk' || !keymapPath) return
    let alive = true
    readText(keymapPath).then(text => {
      if (!alive || !isDevicetreeReady()) return
      const km = parseKeymapText(text)
      const n = km.layers[0]?.keys.length ?? 0
      setKeyCount(n)
    }).catch(() => setKeyCount(null))
    return () => { alive = false }
  }, [detected, keymapPath])

  const allCandidates = useMemo(() => {
    const list = [...candidates]
    if (keyCount) {
      for (const e of catalogueByKeyCount(keyCount)) {
        if (!list.some(c => c.layout.origin === e.id)) list.push({ label: `Catalogue · ${catalogueLabel(e)}`, layout: e.layout })
      }
      list.push({ label: `Plain grid (${keyCount} keys)`, layout: fallbackGrid(keyCount, name || 'grid') })
    }
    return list
  }, [candidates, keyCount, name])

  // Prefer a candidate whose key count matches the keymap.
  useEffect(() => {
    if (!keyCount) return
    const i = allCandidates.findIndex(c => c.layout.keys.length === keyCount)
    if (i >= 0) setLayoutIdx(i)
  }, [allCandidates, keyCount])

  const layout = allCandidates[layoutIdx]?.layout
  const nameTaken = existingNames.some(n => n.toLowerCase() === name.trim().toLowerCase())
  const countMismatch = !!(layout && keyCount && layout.keys.length !== keyCount)
  const canAdd = !!detected && !!layout && !!keymapPath && name.trim().length > 0 && !nameTaken && !countMismatch

  if (busy && !detected) return <div className="skeleton" style={{ height: 80 }} />
  if (error) {
    return (
      <div className="glass" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="panel-inset" role="alert" style={{ padding: '8px 12px', fontSize: 12, color: 'var(--danger)' }}>{error}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={pick}>Choose again</button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }
  if (!detected) return null

  return (
    <div className="glass anim-fade-up" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>New keyboard <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {detected.firmware.toUpperCase()}{detected.shield ? ` · ${detected.shield}` : ''}</span></div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{detected.repoPath ?? keymapPath}</div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)' }}>Name</span>
        <input value={name} onChange={e => setName(e.target.value)} style={{ height: 30, fontSize: 13 }} />
        {nameTaken && <span style={{ color: 'var(--danger)', fontSize: 11 }}>A keyboard with this name already exists.</span>}
      </label>

      {detected.keymapCandidates.length > 1 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Keymap file</span>
          <select value={keymapPath} onChange={e => setKeymapPath(e.target.value)} style={{ height: 30 }}>
            {detected.keymapCandidates.map(p => <option key={p} value={p}>{p.split('/').slice(-2).join('/')}</option>)}
          </select>
        </label>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)' }}>Physical layout{keyCount ? ` · keymap has ${keyCount} keys per layer` : ''}</span>
        <select value={layoutIdx} onChange={e => setLayoutIdx(Number(e.target.value))} style={{ height: 30 }}>
          {allCandidates.map((c, i) => <option key={i} value={i}>{c.label} ({c.layout.keys.length} keys)</option>)}
          {allCandidates.length === 0 && <option value={0}>No layout available</option>}
        </select>
        {countMismatch && <span style={{ color: 'var(--danger)', fontSize: 11 }}>This layout has {layout!.keys.length} keys but the keymap has {keyCount}; pick a matching one.</span>}
      </label>
      {allCandidates.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Browse the catalogue: {CATALOGUE.length} layouts are bundled; choose one by key count above once the keymap is read.
        </div>
      )}

      {layout && (
        <div className="panel-inset" style={{ padding: 8 }}>
          <PhysicalBoard layout={layout} keyAt={(i) => ({ label: String(i), text: 'rgba(226,230,255,0.45)', fontSize: 9 })} editable={false} maxScale={0.8} />
        </div>
      )}

      {detected.pointing.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Pointing devices found: {detected.pointing.map(p => `${p.name} (${p.chip})`).join(', ')}
        </div>
      )}
      {detected.notes.map((n, i) => (
        <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{n}</div>
      ))}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={!canAdd} onClick={() => onAdd({
          name: name.trim(), firmware: detected.firmware, repoPath: detected.repoPath, shield: detected.shield,
          keymapPath, keymapCPath: detected.keymapCPath, layout: layout!, pointing: detected.pointing,
        })}>
          Add keyboard
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
