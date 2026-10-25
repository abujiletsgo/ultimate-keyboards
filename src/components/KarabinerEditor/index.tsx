import { useState, useCallback, useEffect } from 'react'
import { Download, Copy } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from '@/lib/io'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { RuleList } from './RuleList'
import MacbookKeyboard from './MacbookKeyboard'
import MacComboEditor from './MacComboEditor'
import HomerowModEditor from './HomerowModEditor'
import NativeRemappingPanel, { NativeEmergencyStop } from './NativeRemappingPanel'
import KeymapActionBar from '@/components/Keyboard/KeymapActionBar'
import LayerControls from '@/components/Keyboard/LayerControls'
import { registerDirtySource, syncDirty } from '@/lib/dirty'
import { macLayerActivators } from '@/lib/macLayerEditing'
import { ConfirmBanner, useToast } from '@/components/ui'
import { MACBOOK_LAYOUT } from '@/lib/macbookLayout'
import { macLayers, validMacLayer, macKeyFace, macUnplacedKeys, macKeyLabel } from '@/lib/macKeymapView'

type Tab = 'keys' | 'homerow' | 'combos' | 'remapping'
const TABS: [Tab, string][] = [['keys', 'Keymap'], ['homerow', 'Homerow mods'], ['combos', 'Combos'], ['remapping', 'Remapping']]

export default function KarabinerEditor() {
  const [tab, setTab] = useState<Tab>('keys')
  const { profileTitle, exportJSON, rules, layerNames, isDirty, past, future, saveProfile, revertProfile, undo, redo, addLayer, renameLayer, deleteLayer } = useKarabinerStore()
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  useEffect(() => {
    const unregister = registerDirtySource('MacBook keymap', () => useKarabinerStore.getState().isDirty,
      async () => useKarabinerStore.getState().saveProfile(), () => useKarabinerStore.getState().revertProfile())
    const unsubscribe = useKarabinerStore.subscribe(syncDirty)
    return () => { unsubscribe(); unregister() }
  }, [])
  const saveLocal = () => { try { saveProfile(); toast.success('Profile saved locally') } catch (error) { toast.error(`Not saved: ${error}`) } }
  const [compatibilityMessage, setCompatibilityMessage] = useState('')
  const [compatibilityError, setCompatibilityError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const layers = macLayers(rules, layerNames)
  const layer = validMacLayer(rules, selectedLayer, layerNames)
  const layerIndex = layers.findIndex(item => item.name === layer)
  const layerInfo = layers[layerIndex]
  const conflicts = layer === null ? [] : MACBOOK_LAYOUT.filter(key => macKeyFace(rules, key, layer).shadowedBy !== undefined)
  const unplaced = macUnplacedKeys(rules)
  useEffect(() => { if (selectedLayer !== layer) setSelectedLayer(layer) }, [selectedLayer, layer])

  const handleExportAndInstall = useCallback(async () => {
    setExporting(true)
    setCompatibilityError('')
    setCompatibilityMessage('')
    try {
      const json = exportJSON()
      if (IS_TAURI) {
        await invoke<string>('install_karabiner_rules', { title: profileTitle || 'Ultimate Keyboards', json })
        setCompatibilityMessage(`Exported. In Karabiner-Elements, open Complex Modifications → Add rule and enable “${profileTitle || 'Ultimate Keyboards'}”. Export again after editing.`)
      } else {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'ultimate-keyboards.json'
        anchor.click()
        URL.revokeObjectURL(url)
        setCompatibilityMessage('Downloaded Karabiner JSON. Import it into Karabiner-Elements to use this compatibility export.')
      }
    } catch (error) {
      setCompatibilityError(`Karabiner export failed: ${error}`)
    } finally {
      setExporting(false)
    }
  }, [exportJSON, profileTitle])

  const handleCopyJSON = useCallback(async () => {
    setCompatibilityError('')
    try {
      await navigator.clipboard.writeText(exportJSON())
      setCompatibilityMessage('Karabiner JSON copied.')
    } catch (error) {
      setCompatibilityError(`Could not copy Karabiner JSON: ${error}`)
    }
  }, [exportJSON])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <div className="section-header" style={{ flexWrap: 'wrap', height: 'auto', minHeight: 52, flexShrink: 0, gap: 10 }}>
        <span className="section-title" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>MacBook<span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-secondary)' }}>Native · US ANSI · {MACBOOK_LAYOUT.length} keys</span></span>
        <div className="seg-ctrl" role="tablist" aria-label="MacBook Keys sections" style={{ flexWrap: 'wrap' }}>
          {TABS.map(([id, label], index) => (
            <button key={id} id={`mac-keys-tab-${id}`} role="tab" aria-selected={tab === id}
              aria-controls="mac-keys-editor" tabIndex={tab === id ? 0 : -1}
              className={`seg-btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}
              onKeyDown={event => {
                const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
                  : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null
                if (next === null) return
                event.preventDefault()
                setTab(TABS[next][0])
                document.getElementById(`mac-keys-tab-${TABS[next][0]}`)?.focus()
              }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <KeymapActionBar label={<span className="mono" title={profileTitle} style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileTitle}</span>}
          dirty={isDirty} canUndo={past.length > 0} canRedo={future.length > 0} onSave={saveLocal} onRevert={revertProfile} onUndo={undo} onRedo={redo}
          extraActions={<span style={{ display: tab === 'remapping' ? 'none' : 'contents' }}><NativeEmergencyStop /></span>} />
        <div id="mac-keys-editor" role="tabpanel" aria-labelledby={`mac-keys-tab-${tab}`} tabIndex={0}
          style={{ display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0, minWidth: 0 }}>
          {tab === 'remapping' && <NativeRemappingPanel />}
          {tab === 'keys' && <>
            <LayerControls layers={layers.map(item => ({ key: item.name === null ? 'base' : `layer:${item.name}`, name: item.name ?? 'Base' }))}
              selected={layerIndex} onSelect={index => { setSelectedLayer(layers[index].name); setConfirmDelete(null) }}
              label="MacBook layers" idPrefix="mac-layer-tab" panelId="mac-layer-panel" accessibleLayerNames
              canRename={layer !== null} canDelete={layer !== null}
              onAdd={name => { const error = addLayer(name); if (!error) setSelectedLayer(name); return error }}
              onRename={name => { const error = renameLayer(layer, name); if (!error) setSelectedLayer(name); return error }}
              onDelete={() => setConfirmDelete(layer)} />
            {confirmDelete !== null && (macLayerActivators(rules, confirmDelete).length > 0
              ? <div className="panel-inset" role="alert" style={{ padding: '10px 14px', fontSize: 12 }}>
                  Layer "{confirmDelete}" can't be deleted yet. Remove or change its layer keys first: {macLayerActivators(rules, confirmDelete).map(macKeyLabel).join(', ')}.
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Close</button>
                </div>
              : <ConfirmBanner danger message={<>Delete layer <strong>{confirmDelete}</strong> and its {rules.filter(rule => rule.type === 'layer_binding' && rule.layerName === confirmDelete).length} bindings? Other rules remain unchanged.</>}
                  confirmLabel="Delete layer" onCancel={() => setConfirmDelete(null)} onConfirm={() => {
                    const error = deleteLayer(confirmDelete)
                    if (error) toast.error(error)
                    else { setSelectedLayer(null); setConfirmDelete(null) }
                  }} />)}
            <div className="glass anim-fade-up" id="mac-layer-panel" role="tabpanel" aria-labelledby={`mac-layer-tab-${layerIndex}`}
              style={{ padding: '12px 16px', minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', overflowWrap: 'anywhere' }}>
                Layer {layerIndex}: {layer ?? 'Base'}<span style={{ fontWeight: 400, marginLeft: 8 }}>— click key to edit</span>
              </div>
              <MacbookKeyboard key={layer === null ? 'base' : `layer:${layer}`}  rules={rules} selectedLayer={layer} />
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 10, overflowWrap: 'anywhere' }}>
                {layer === null ? 'Configured Base mappings. Modifier rules and combos can change the result.'
                  : `${layerInfo.activators.length ? `Layer key: ${layerInfo.activators.map(macKeyLabel).join(', ')}.` : 'No activator configured for this layer.'} Dashed keys inherit Base. Layer selection only previews mappings.`}
              </p>
              {conflicts.length > 0 && <p role="note" style={{ fontSize: 11, color: 'var(--warning)', marginTop: 6, lineHeight: 1.5 }}>
                Rule-order conflict: {conflicts.map(key => macKeyLabel(key.code)).join(', ')}. These configured bindings follow an earlier Base rule; inspect the ordered rules below.
              </p>}
              {rules.length === 0 && <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12 }}>
                No mappings yet. Click a key to begin.
                <button className="btn btn-secondary btn-sm" onClick={() => useKarabinerStore.getState().loadExample()}>Load example profile</button>
              </div>}
            </div>
            <details className="glass" style={{ flexShrink: 0, overflow: 'hidden' }}>
              <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 12 }}>Ordered rules ({rules.length}) · advanced mappings</summary>
              {unplaced.length > 0 && <p style={{ padding: '0 14px 10px', fontSize: 11, color: 'var(--warning)', overflowWrap: 'anywhere' }}>
                Keys outside this US ANSI diagram: {unplaced.join(', ')}. Their rules are retained below.
              </p>}
              <RuleList />
            </details>
          </>}
          {tab === 'homerow' && <div className="glass anim-fade-up" style={{ padding: '16px 20px' }}><HomerowModEditor /></div>}
          {tab === 'combos' && <div className="glass anim-fade-up" style={{ padding: '16px 20px' }}><MacComboEditor /></div>}
        </div>
        <details className="panel-inset" style={{ padding: '12px 16px', flexShrink: 0 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Optional: Karabiner-Elements compatibility export</summary>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)' }}>
            For an existing Karabiner-Elements setup. Stop native remapping before enabling the same rules there.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleCopyJSON} disabled={exporting}>
              <Copy size={13} aria-hidden="true" />Copy Karabiner JSON
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportAndInstall} disabled={rules.length === 0 || exporting}>
              <Download size={13} aria-hidden="true" />{exporting ? 'Exporting…' : IS_TAURI ? 'Export to Karabiner-Elements' : 'Download Karabiner JSON'}
            </button>
          </div>
          <div role="status" style={{ fontSize: 12, lineHeight: 1.6, marginTop: compatibilityMessage ? 10 : 0 }}>{compatibilityMessage}</div>
          <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: compatibilityError ? 10 : 0 }}>{compatibilityError}</div>
        </details>
      </div>
    </div>
  )
}
