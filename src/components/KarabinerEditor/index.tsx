import { useState, useEffect } from 'react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { RuleList } from './RuleList'
import MacbookKeyboard from './MacbookKeyboard'
import KeyPanel, { type AddingCombo } from './KeyPanel'
import TypingFeelPanel from './TypingFeelPanel'
import { useProfileTransfer } from './ProfileTransfer'
import NativeRemappingPanel, { NativeEmergencyStop } from './NativeRemappingPanel'
import KeymapActionBar from '@/components/Keyboard/KeymapActionBar'
import LayerControls from '@/components/Keyboard/LayerControls'
import { registerDirtySource, syncDirty } from '@/lib/dirty'
import { macLayerActivators } from '@/lib/macLayerEditing'
import { ConfirmBanner, useToast } from '@/components/ui'
import Templates from '@/components/Templates'
import { initialEditorTab } from '@/lib/templates'
import { LAPTOP_LAYOUT } from '@/lib/macbookLayout'
import { hostTerms } from '@/lib/platform'
import { macLayers, validMacLayer, macUnplacedKeys, macKeyLabel } from '@/lib/macKeymapView'
import { keyName } from '@/lib/keyActions'
import { NATIVE_KEYS } from '@/lib/nativeBinding'

type Tab = 'keys' | 'templates' | 'remapping'
const TABS: [Tab, string][] = [['keys', 'Keys'], ['templates', 'Templates'], ['remapping', 'Remapping']]

export default function KarabinerEditor() {
  const [tab, setTab] = useState<Tab>(() => initialEditorTab<Tab>('keys'))
  const { profileTitle, rules, layerNames, isDirty, past, future, saveProfile, revertProfile, undo, redo, addLayer, renameLayer, deleteLayer } = useKarabinerStore()
  const toast = useToast()
  const transfer = useProfileTransfer()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  useEffect(() => {
    const unregister = registerDirtySource(`${hostTerms().laptop} keymap`, () => useKarabinerStore.getState().isDirty,
      async () => useKarabinerStore.getState().saveProfile(), () => useKarabinerStore.getState().revertProfile())
    const unsubscribe = useKarabinerStore.subscribe(syncDirty)
    return () => { unsubscribe(); unregister() }
  }, [])
  const saveLocal = () => { try { saveProfile(); toast.success('Profile saved locally') } catch (error) { toast.error(`Not saved: ${error}`) } }
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  const layers = macLayers(rules, layerNames)
  const layer = validMacLayer(rules, selectedLayer, layerNames)
  const layerIndex = layers.findIndex(item => item.name === layer)
  const layerInfo = layers[layerIndex]
  const unplaced = macUnplacedKeys(rules)
  useEffect(() => { if (selectedLayer !== layer) setSelectedLayer(layer) }, [selectedLayer, layer])
  // The key whose panel is open, and the add-combo steps ("click the other key").
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [adding, setAdding] = useState<AddingCombo | null>(null)
  const closePanel = () => { setSelectedKey(null); setAdding(null) }
  const clickKey = (code: string) => {
    if (adding && adding.partner === null && selectedKey !== null) {
      if (code === selectedKey) return
      setAdding(NATIVE_KEYS.includes(code) ? { partner: code } : { partner: null, error: `${keyName(code)} can’t be part of a combo. Click another key.` })
      return
    }
    setAdding(null); setSelectedKey(code)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <div className="section-header" style={{ flexWrap: 'wrap', height: 'auto', minHeight: 52, flexShrink: 0, gap: 10 }}>
        <span className="section-title" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>{hostTerms().laptop}<span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-secondary)' }}>US keyboard · {LAPTOP_LAYOUT.length} keys</span></span>
        <div className="seg-ctrl" role="tablist" aria-label={`${hostTerms().laptopKeys} sections`} style={{ flexWrap: 'wrap' }}>
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

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 'clamp(12px, 3vw, 24px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <KeymapActionBar label={<span className="mono" title={profileTitle} style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileTitle}</span>}
          dirty={isDirty} canUndo={past.length > 0} canRedo={future.length > 0} onSave={saveLocal} onRevert={revertProfile} onUndo={undo} onRedo={redo}
          extraActions={<>{transfer.buttons}<span style={{ display: tab === 'remapping' ? 'none' : 'contents' }}><NativeEmergencyStop /></span></>} />
        {transfer.banner}
        <div id="mac-keys-editor" role="tabpanel" aria-labelledby={`mac-keys-tab-${tab}`} tabIndex={0}
          style={{ display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0, minWidth: 0 }}>
          {tab === 'templates' && <Templates onTurnOn={() => setTab('remapping')} />}
          {tab === 'remapping' && <>
            <NativeRemappingPanel />
            <details className="glass" style={{ flexShrink: 0, overflow: 'hidden' }}>
              <summary style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 12 }}>Advanced</summary>
              <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <TypingFeelPanel />
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text)' }}>All changes, in order ({rules.length})</h4>
                  {unplaced.length > 0 && <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--warning)', overflowWrap: 'anywhere' }}>
                    These keys aren’t on the picture: {unplaced.join(', ')}. Their changes are kept here.
                  </p>}
                  <RuleList />
                </div>
              </div>
            </details>
          </>}
          {tab === 'keys' && <>
            <LayerControls layers={layers.map(item => ({ key: item.name === null ? 'base' : `layer:${item.name}`, name: item.name ?? 'Base' }))}
              selected={layerIndex} onSelect={index => { setSelectedLayer(layers[index].name); setConfirmDelete(null); setAdding(null) }}
              label={`${hostTerms().laptop} layers`} idPrefix="mac-layer-tab" panelId="mac-layer-panel" accessibleLayerNames
              canRename={layer !== null} canDelete={layer !== null}
              onAdd={name => { const error = addLayer(name); if (!error) setSelectedLayer(name); return error }}
              onRename={name => { const error = renameLayer(layer, name); if (!error) setSelectedLayer(name); return error }}
              onDelete={() => setConfirmDelete(layer)} />
            {confirmDelete !== null && (macLayerActivators(rules, confirmDelete).length > 0
              ? <div className="panel-inset" role="alert" style={{ padding: '10px 14px', fontSize: 12 }}>
                  Layer "{confirmDelete}" can't be deleted yet. Change its layer keys first: {macLayerActivators(rules, confirmDelete).map(macKeyLabel).join(', ')}.
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Close</button>
                </div>
              : <ConfirmBanner danger message={<>Delete layer <strong>{confirmDelete}</strong> and its {rules.filter(rule => rule.type === 'layer_binding' && rule.layerName === confirmDelete).length} changed keys?</>}
                  confirmLabel="Delete layer" onCancel={() => setConfirmDelete(null)} onConfirm={() => {
                    const error = deleteLayer(confirmDelete)
                    if (error) toast.error(error)
                    else { setSelectedLayer(null); setConfirmDelete(null) }
                  }} />)}
            <div className="glass" id="mac-layer-panel" role="tabpanel" aria-labelledby={`mac-layer-tab-${layerIndex}`}
              style={{ padding: '12px 16px', minWidth: 0 }}>
              <MacbookKeyboard key={layer === null ? 'base' : `layer:${layer}`} rules={rules} selectedLayer={layer} selectedCode={selectedKey}
                onKeyClick={key => clickKey(key.code)} />
              {selectedKey === null && <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 10, overflowWrap: 'anywhere' }}>
                {layer === null ? 'Click a key to change it.' : `Click a key to change it. Keys marked ··· use the Base key.${layerInfo.activators.length ? '' : ' To reach this layer, set a key on Base to Hold → Layer.'}`}
              </p>}
              {rules.length === 0 && <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                Nothing changed yet.
                <button className="btn btn-secondary btn-sm" onClick={() => useKarabinerStore.getState().loadExample()}>Load example</button>
              </div>}
            </div>
            {selectedKey !== null && <KeyPanel key={selectedKey} code={selectedKey} layer={layer} adding={adding} onAdding={setAdding} onClose={closePanel} onTurnOn={() => setTab('remapping')} />}
          </>}
        </div>
      </div>
    </div>
  )
}
