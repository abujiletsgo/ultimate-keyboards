/**
 * ZMK keymap editor for one registered keyboard: loads its .keymap, renders
 * layers on its physical layout, and saves through the validated atomic
 * writer. Keymaps with constructs the editor cannot round-trip open
 * read-only with the construct named.
 */
import React, { useEffect, useState } from 'react'
import { parseKeymapText, updateCombosInSource, updateLayerBindingsInSource } from '@/lib/zmkParser'
import { readText, saveText, backupExists, restoreBackup, ValidationError } from '@/lib/io'
import { checkZmkCompatibility, type CompatReport } from '@/lib/compat'
import { registerDirtySource, syncDirty } from '@/lib/dirty'
import { useZMKStore } from '@/stores/zmkStore'
import type { KeyboardDef } from '@/lib/registry/types'
import SplitKeyboard from '@/components/ZMKEditor/SplitKeyboard'
import ComboEditor from '@/components/ZMKEditor/ComboEditor'
import { ConfirmBanner, useToast } from '@/components/ui'
import { Undo2, Redo2, ImageDown } from 'lucide-react'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { keymapToSvg } from '@/lib/export/svg'
import BehaviorsEditor from './BehaviorsEditor'

interface Props {
  keyboard: KeyboardDef
  view: 'keymap' | 'combos' | 'behaviors'
}

/** Save the store's current keymap to its file (used by the toolbar and the app-level guard). */
export async function saveZmkKeymap(): Promise<void> {
  const { keymap, filePath, setKeymap, setDirty, selectedLayer, setSelectedLayer } = useZMKStore.getState()
  if (!keymap || !filePath) return
  let updated = updateLayerBindingsInSource(keymap.rawSource, keymap.layers)
  updated = updateCombosInSource(updated, keymap.combos)
  await saveText(filePath, updated, {
    validate: (out) => {
      let km
      try { km = parseKeymapText(out) } catch (e) { return `output does not parse: ${e}` }
      if (km.layers.length !== keymap.layers.length)
        return `layer count would change (${keymap.layers.length} → ${km.layers.length})`
      for (let i = 0; i < km.layers.length; i++) {
        if (km.layers[i].keys.length !== keymap.layers[i].keys.length)
          return `layer "${km.layers[i].name}" key count would change (${keymap.layers[i].keys.length} → ${km.layers[i].keys.length})`
      }
      if (km.combos.length !== keymap.combos.length)
        return `combo count would change (${keymap.combos.length} → ${km.combos.length})`
      return null
    },
  })
  setKeymap(parseKeymapText(updated), filePath)
  setSelectedLayer(selectedLayer)
  setDirty(false)
}

const ZmkKeymapEditor: React.FC<Props> = ({ keyboard, view }) => {
  const { keymap, filePath, isDirty, setKeymap, updateLayerKey, selectedLayer, setSelectedLayer, addLayer, renameLayer, deleteLayer, layerReferences, undo, redo, past, future } = useZMKStore()
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [addingLayer, setAddingLayer] = useState(false)
  const [newLayerName, setNewLayerName] = useState('')
  const [renamingLayer, setRenamingLayer] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasBackup, setHasBackup] = useState(false)
  const [compat, setCompat] = useState<CompatReport | null>(null)

  const flash = (msg: string, ok = true) => {
    if (ok) toast.success(msg); else toast.error(msg)
  }

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const text = await readText(keyboard.keymapPath)
      const km = parseKeymapText(text)
      setCompat(checkZmkCompatibility(text, km.syntaxErrors))
      setKeymap(km, keyboard.keymapPath)
      setSelectedLayer(0)
    } catch (err) {
      setLoadError(String(err))
      setKeymap(null, keyboard.keymapPath)
    } finally {
      setLoading(false)
    }
  }

  // (Re)load whenever this keyboard's file is not the one in the store.
  useEffect(() => {
    if (keymap && filePath === keyboard.keymapPath) { setLoading(false); return }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboard.keymapPath])

  useEffect(() => {
    let alive = true
    backupExists(keyboard.keymapPath).then(v => { if (alive) setHasBackup(v) })
    return () => { alive = false }
  }, [keyboard.keymapPath, isDirty])

  // Register save/discard with the app-wide dirty registry.
  useEffect(() => registerDirtySource(
    `keymap:${keyboard.name}`,
    () => useZMKStore.getState().isDirty && useZMKStore.getState().filePath === keyboard.keymapPath,
    saveZmkKeymap,
    () => { useZMKStore.getState().setDirty(false); load() },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [keyboard.keymapPath])
  useEffect(() => { syncDirty() }, [isDirty])

  const editable = compat?.editable ?? true

  const onSave = async () => {
    try {
      await saveZmkKeymap()
      setHasBackup(true)
      flash('Saved!')
    } catch (err) {
      const msg = err instanceof ValidationError ? `Not saved — ${err.message}` : `Error saving: ${err}`
      flash(msg, false)
    }
  }

  const exportSvg = async () => {
    if (!keymap) return
    try {
      const svg = keymapToSvg(keyboard.layout, keymap.layers, { combos: keymap.combos, title: keyboard.name })
      const target = await saveDialog({ defaultPath: `${keyboard.name.replace(/\s+/g, '-').toLowerCase()}-keymap.svg`, filters: [{ name: 'SVG', extensions: ['svg'] }] })
      if (!target) return
      await saveText(target, svg)
      flash(`Exported ${target.split('/').pop()}`)
    } catch (err) {
      flash(`Export failed: ${err}`, false)
    }
  }

  const onRestore = async () => {
    try {
      const text = await restoreBackup(keyboard.keymapPath)
      const km = parseKeymapText(text)
      setCompat(checkZmkCompatibility(text, km.syntaxErrors))
      setKeymap(km, keyboard.keymapPath)
      setSelectedLayer(0)
      flash('Backup restored')
    } catch (err) {
      flash(`Error restoring: ${err}`, false)
    }
  }

  const handleBindingChange = (pos: number, newBinding: string) => {
    if (!keymap || !editable) return
    if (keymap.layers[selectedLayer]?.keys[pos] === newBinding) return
    updateLayerKey(selectedLayer, pos, newBinding)
  }

  if (loading) {
    return <div className="skeleton" style={{ height: 160 }} />
  }
  if (!keymap) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
        {loadError && (
          <div className="panel-inset" role="alert" style={{ fontSize: 12, color: 'var(--danger)', background: 'rgba(251,113,133,0.08)', padding: '8px 12px', maxWidth: 520, wordBreak: 'break-all' }}>
            {loadError}
          </div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Could not load <code className="mono">{keyboard.keymapPath}</code>
        </div>
        <button className="btn btn-primary" onClick={load}>Retry</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={keyboard.keymapPath}>
          {keyboard.keymapPath.split('/').pop()}
        </span>
        {isDirty && (
          <span className="tag" style={{ color: 'var(--warning)', background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.25)' }}>Unsaved</span>
        )}
        {!editable && (
          <span className="tag" title="See the compatibility notes below">Read-only</span>
        )}
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={!isDirty || !editable}>Save</button>
        {hasBackup && (
          <button className="btn btn-secondary btn-sm" onClick={onRestore} title="Put back the version saved before the last write (.bak)">
            Restore backup
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={exportSvg} title="Export every layer as an SVG picture"><ImageDown size={13} /> SVG</button>
        <button className="btn btn-ghost btn-sm btn-icon" aria-label="Undo" title="Undo (⌘Z)" disabled={past.length === 0 || !editable} onClick={undo}><Undo2 size={13} /></button>
        <button className="btn btn-ghost btn-sm btn-icon" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={future.length === 0 || !editable} onClick={redo}><Redo2 size={13} /></button>
        {isDirty && (
          <button className="btn btn-ghost btn-sm" title="Discard unsaved edits and reload from disk" onClick={() => { useZMKStore.getState().setDirty(false); load() }}>Revert</button>
        )}
      </div>

      {confirmDelete !== null && keymap.layers[confirmDelete] && (() => {
        const refs = layerReferences(confirmDelete)
        const l = keymap.layers[confirmDelete]
        return refs.length > 0 ? (
          <div className="panel-inset" role="alert" style={{ padding: '10px 14px', fontSize: 12, borderColor: 'rgba(251,191,36,0.35)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Layer {confirmDelete} "{l.displayName ?? l.name}" can't be deleted yet — it is still referenced:</div>
            <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
              {refs.map((r, i) => (
                <li key={i}>
                  {r.where}: <code className="mono">{r.binding}</code>
                  {r.layer !== undefined && r.pos !== undefined && (
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => { setSelectedLayer(r.layer!); setConfirmDelete(null) }}>Go to key</button>
                  )}
                </li>
              ))}
            </ul>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Close</button>
          </div>
        ) : (
          <ConfirmBanner
            danger
            message={<>Delete layer {confirmDelete} <strong>{l.displayName ?? l.name}</strong>? References to higher layers will be renumbered.</>}
            confirmLabel="Delete layer"
            onConfirm={() => {
              const err = deleteLayer(confirmDelete)
              setConfirmDelete(null)
              if (err) flash(err, false); else flash('Layer deleted — higher layer references renumbered')
            }}
            onCancel={() => setConfirmDelete(null)}
          />
        )
      })()}

      {compat && compat.issues.length > 0 && (
        <div className="panel-inset" role={editable ? undefined : 'alert'} style={{ padding: '10px 14px', fontSize: 12, color: editable ? 'var(--text-secondary)' : 'var(--warning)', borderColor: editable ? undefined : 'rgba(251,191,36,0.35)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {editable ? 'Notes about this keymap' : 'This keymap opened read-only'}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {compat.issues.map((i, n) => (
              <li key={n}>
                line {i.line}: {i.construct}{i.blocking ? '' : ' (not editable yet)'} — <code className="mono">{i.detail}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === 'keymap' ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginRight: 4 }}>Layer:</span>
            <div className="seg-ctrl" role="tablist" aria-label="Layers" style={{ flexWrap: 'wrap' }}>
              {keymap.layers.map((layer, idx) => (
                <button
                  key={layer.name}
                  role="tab"
                  aria-selected={selectedLayer === idx}
                  className={`seg-btn${selectedLayer === idx ? ' active' : ''}`}
                  onClick={() => setSelectedLayer(idx)}
                  title={`Layer ${idx} — ${layer.name}`}
                >
                  <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', fontWeight: 700, opacity: selectedLayer === idx ? 0.9 : 0.45, marginRight: 5 }}>{idx}</span>
                  {layer.displayName ?? layer.name}
                </button>
              ))}
            </div>
            {editable && (addingLayer ? (
              <form style={{ display: 'flex', gap: 6, alignItems: 'center' }} onSubmit={e => {
                e.preventDefault()
                const name = newLayerName.trim().replace(/[^\w+]/g, '_')
                if (!name) return
                if (keymap.layers.some(l => l.name === name || l.displayName === name)) { flash(`Layer "${name}" already exists`, false); return }
                const idx = addLayer(name)
                if (idx >= 0) flash(`Layer ${idx} "${name}" created — all keys transparent`, true)
                setNewLayerName(''); setAddingLayer(false)
              }}>
                <input autoFocus value={newLayerName} onChange={e => setNewLayerName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setAddingLayer(false); setNewLayerName('') } }}
                  placeholder="layer_name" style={{ width: 130, height: 26, fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                <button type="submit" className="btn btn-primary btn-sm">Create</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAddingLayer(false); setNewLayerName('') }}>Cancel</button>
              </form>
            ) : renamingLayer ? (
              <form style={{ display: 'flex', gap: 6, alignItems: 'center' }} onSubmit={e => {
                e.preventDefault()
                const name = renameValue.trim().replace(/[^\w+]/g, '_')
                if (!name) return
                const err = renameLayer(selectedLayer, name)
                if (err) { setRenameError(err); return }
                setRenameError(null)
                flash(`Renamed to "${name}"`)
                setRenamingLayer(false); setRenameValue('')
              }}>
                <input autoFocus value={renameValue} onChange={e => { setRenameValue(e.target.value); setRenameError(null) }}
                  aria-invalid={!!renameError} aria-describedby={renameError ? 'rename-error' : undefined}
                  onKeyDown={e => { if (e.key === 'Escape') { setRenamingLayer(false); setRenameValue(''); setRenameError(null) } }}
                  placeholder="new_name" style={{ width: 130, height: 26, fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                {renameError && <span id="rename-error" role="alert" style={{ fontSize: 11, color: 'var(--danger)' }}>{renameError}</span>}
                <button type="submit" className="btn btn-primary btn-sm">Rename</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRenamingLayer(false); setRenameValue('') }}>Cancel</button>
              </form>
            ) : (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setAddingLayer(true)} title="Add a new empty layer">+ Layer</button>
                <button className="btn btn-ghost btn-sm" title={`Rename layer ${selectedLayer}`} onClick={() => {
                  setRenameValue(keymap.layers[selectedLayer]?.displayName ?? keymap.layers[selectedLayer]?.name ?? '')
                  setRenamingLayer(true)
                }}>Rename</button>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} title={`Delete layer ${selectedLayer} (blocked if referenced)`} onClick={() => setConfirmDelete(selectedLayer)}>Delete</button>
              </>
            ))}
          </div>

          <div className="glass anim-fade-up" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Layer {selectedLayer}: {keymap.layers[selectedLayer]?.displayName ?? keymap.layers[selectedLayer]?.name}
              <span style={{ fontWeight: 400, marginLeft: 8 }}>{editable ? '— click key to edit' : '— read-only'}</span>
            </div>
            <SplitKeyboard
              layer={keymap.layers[selectedLayer] ?? null}
              layout={keyboard.layout}
              onBindingChange={editable ? handleBindingChange : undefined}
            />
          </div>
        </>
      ) : view === 'behaviors' ? (
        <div className="glass anim-fade-up" style={{ padding: '12px 16px' }}>
          <BehaviorsEditor />
        </div>
      ) : (
        <div className="glass anim-fade-up" style={{ padding: '12px 16px' }}>
          <ComboEditor layout={keyboard.layout} />
        </div>
      )}
    </div>
  )
}

export default ZmkKeymapEditor
