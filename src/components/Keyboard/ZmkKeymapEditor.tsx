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
import { syncDirty } from '@/lib/dirty'
import { useZMKStore } from '@/stores/zmkStore'
import type { KeyboardDef } from '@/lib/registry/types'
import SplitKeyboard from '@/components/ZMKEditor/SplitKeyboard'
import ComboEditor from '@/components/ZMKEditor/ComboEditor'
import { ConfirmBanner, useToast } from '@/components/ui'
import { ImageDown } from 'lucide-react'
import KeymapActionBar from './KeymapActionBar'
import LayerControls from './LayerControls'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { downloadDir, join } from '@tauri-apps/api/path'
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
  if (!checkZmkCompatibility(keymap.rawSource, keymap.syntaxErrors).editable)
    throw new Error('this keymap is read-only here (it uses constructs the editor cannot rewrite safely)')
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
    if (keymap && filePath === keyboard.keymapPath) {
      setCompat(checkZmkCompatibility(keymap.rawSource, keymap.syntaxErrors))
      setLoading(false); return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboard.keymapPath])

  useEffect(() => {
    let alive = true
    backupExists(keyboard.keymapPath).then(v => { if (alive) setHasBackup(v) })
    return () => { alive = false }
  }, [keyboard.keymapPath, isDirty])

  // The dirty source is registered by KeyboardSection, which stays mounted across tabs.
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
      // The save panel opens at the directory of defaultPath; a bare file name
      // would open it at the process cwd (`/` for a launched app).
      const dir = await downloadDir().catch(() => '')
      const name = `${keyboard.name.replace(/\s+/g, '-').toLowerCase()}-keymap.svg`
      const target = await saveDialog({ defaultPath: dir ? await join(dir, name) : name, filters: [{ name: 'SVG', extensions: ['svg'] }] })
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
      <KeymapActionBar
        label={<span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={keyboard.keymapPath}>{keyboard.keymapPath.split('/').pop()}</span>}
        dirty={isDirty} editable={editable} canUndo={past.length > 0} canRedo={future.length > 0}
        onSave={onSave} onUndo={undo} onRedo={redo}
        onRevert={() => { useZMKStore.getState().setDirty(false); load() }} revertTitle="Discard unsaved edits and reload from disk"
        afterSave={hasBackup && <button className="btn btn-secondary btn-sm" onClick={onRestore} title="Put back the version saved before the last write (.bak)">Restore backup</button>}
        extraActions={<button className="btn btn-ghost btn-sm" onClick={exportSvg} title="Export every layer as an SVG picture"><ImageDown size={13} /> SVG</button>}
      />

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
          <LayerControls
            layers={keymap.layers.map((layer, index) => ({ key: layer.name, name: layer.displayName ?? layer.name, title: `Layer ${index} — ${layer.name}` }))}
            selected={selectedLayer} onSelect={setSelectedLayer} editable={editable}
            normalizeName={name => name.trim().replace(/[^\w+]/g, '_')}
            onAdd={name => {
              if (keymap.layers.some(layer => layer.name === name || layer.displayName === name)) return `Layer "${name}" already exists`
              const index = addLayer(name)
              if (index < 0) return 'Could not create layer'
              flash(`Layer ${index} "${name}" created — all keys transparent`)
              return null
            }}
            onRename={name => {
              const error = renameLayer(selectedLayer, name)
              if (!error) flash(`Renamed to "${name}"`)
              return error
            }}
            onDelete={() => setConfirmDelete(selectedLayer)}
          />

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
        <div className="glass anim-fade-up" inert={!editable} style={{ padding: '12px 16px', opacity: editable ? 1 : 0.55 }}>
          <BehaviorsEditor />
        </div>
      ) : (
        <div className="glass anim-fade-up" inert={!editable} style={{ padding: '12px 16px', opacity: editable ? 1 : 0.55 }}>
          <ComboEditor layout={keyboard.layout} />
        </div>
      )}
    </div>
  )
}

export default ZmkKeymapEditor
