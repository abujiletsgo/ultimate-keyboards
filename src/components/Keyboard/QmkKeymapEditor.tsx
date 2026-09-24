/**
 * QMK editor for one registered keyboard: VIA layout JSON layers on the
 * keyboard's physical layout, plus the keymap.c combo editor when a
 * keymap.c path is known.
 */
import React, { useEffect, useState } from 'react'
import { useQMKStore } from '@/stores/qmkStore'
import { registerDirtySource, syncDirty } from '@/lib/dirty'
import type { KeyboardDef } from '@/lib/registry/types'
import QMKKeyboard from '@/components/ZMKEditor/QMKKeyboard'
import QMKComboEditor from '@/components/ZMKEditor/QMKComboEditor'

interface Props {
  keyboard: KeyboardDef
  view: 'keymap' | 'combos'
}

const QmkKeymapEditor: React.FC<Props> = ({ keyboard, view }) => {
  const { keymap, filePath, isDirty, loadError, load, updateLayerKey, save } = useQMKStore()
  const [selectedLayer, setSelectedLayer] = useState(0)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (keymap && filePath === keyboard.keymapPath) return
    load(keyboard.keymapPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboard.keymapPath])

  useEffect(() => registerDirtySource(
    `qmk:${keyboard.name}`,
    () => useQMKStore.getState().isDirty && useQMKStore.getState().filePath === keyboard.keymapPath,
    () => useQMKStore.getState().save(),
    () => { useQMKStore.getState().load(keyboard.keymapPath) },
  ), [keyboard.keymapPath, keyboard.name])
  useEffect(() => { syncDirty() }, [isDirty])

  const handleSave = async () => {
    try {
      await save()
      setStatus({ msg: 'Saved!', ok: true })
      setTimeout(() => setStatus(null), 2000)
    } catch (err) {
      setStatus({ msg: `Error: ${err}`, ok: false })
    }
  }

  const currentLayer = keymap?.layers[selectedLayer]

  if (view === 'combos') {
    if (!keyboard.keymapCPath) {
      return (
        <div className="panel-inset" style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
          No <code className="mono">keymap.c</code> is registered for this keyboard, so combos can't be edited. Add its path in Settings → Edit.
        </div>
      )
    }
    return <QMKComboEditor keymapCPath={keyboard.keymapCPath} layout={keyboard.layout} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }} title={keyboard.keymapPath}>
          {keyboard.keymapPath.split('/').pop()}
        </span>
        {isDirty && (
          <span className="tag" style={{ color: 'var(--warning)', background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.25)' }}>Unsaved</span>
        )}
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!isDirty}>Save</button>
        <button className="btn btn-secondary btn-sm" onClick={() => { if (!isDirty || window.confirm('Discard unsaved edits and reload from disk?')) load(keyboard.keymapPath) }}>Reload</button>
        {status && <span role="status" style={{ fontSize: 12, color: status.ok ? 'var(--success)' : 'var(--danger)' }}>{status.msg}</span>}
      </div>

      {loadError ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: 12 }}>
          <div className="panel-inset" role="alert" style={{ fontSize: 12, color: 'var(--danger)', background: 'rgba(251,113,133,0.08)', padding: '8px 12px', maxWidth: 520, wordBreak: 'break-all' }}>{loadError}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Could not load <code className="mono">{keyboard.keymapPath}</code></div>
          <button className="btn btn-primary" onClick={() => load(keyboard.keymapPath)}>Retry</button>
        </div>
      ) : !keymap ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginRight: 4 }}>Layer:</span>
            <div className="seg-ctrl" role="tablist" aria-label="Layers" style={{ flexWrap: 'wrap' }}>
              {keymap.layers.map((layer, idx) => (
                <button key={layer.name} role="tab" aria-selected={selectedLayer === idx} className={`seg-btn${selectedLayer === idx ? ' active' : ''}`} onClick={() => setSelectedLayer(idx)} title={`Layer ${idx} — ${layer.name}`}>
                  <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', fontWeight: 700, opacity: selectedLayer === idx ? 0.9 : 0.45, marginRight: 5 }}>{idx}</span>
                  {layer.name}
                </button>
              ))}
            </div>
          </div>
          <div className="glass anim-fade-up" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Layer {selectedLayer}: {currentLayer?.name}
              <span style={{ fontWeight: 400, marginLeft: 8 }}>— click key to edit</span>
            </div>
            <QMKKeyboard
              keys={currentLayer?.keys ?? []}
              layout={keyboard.layout}
              onBindingChange={(pos, kc) => updateLayerKey(selectedLayer, pos, kc)}
            />
          </div>
        </>
      )}
    </div>
  )
}

export default QmkKeymapEditor
