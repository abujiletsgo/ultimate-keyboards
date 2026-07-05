import React, { useState, useEffect } from 'react';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { parseKeymapText, updateCombosInSource, updateLayerBindingsInSource } from '../../lib/zmkParser';
import { ZMK_KEYBOARDS, getSelectedKeyboard, setSelectedKeyboard, type ZMKKeyboardDef } from '../../lib/keyboards';
import { useZMKStore } from '../../stores/zmkStore';
import { useQMKStore } from '../../stores/qmkStore';
import SplitKeyboard from './SplitKeyboard';
import QMKKeyboard from './QMKKeyboard';
import ComboEditor from './ComboEditor'
import QMKComboEditor from './QMKComboEditor';

// ─── ZMK Tab ──────────────────────────────────────────────────────────────────

const ZMKTab: React.FC = () => {
  const { keymap, filePath, isDirty, setKeymap, setDirty, updateLayerKey, selectedLayer, setSelectedLayer, addLayer, renameLayer, deleteLayer } = useZMKStore();
  const [keyboard, setKeyboard] = useState<ZMKKeyboardDef>(getSelectedKeyboard);
  const [addingLayer, setAddingLayer] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [renamingLayer, setRenamingLayer] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [view, setView] = useState<'keymap' | 'combos'>('keymap');
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Keyboard the user tried to switch to while having unsaved changes */
  const [pendingSwitch, setPendingSwitch] = useState<ZMKKeyboardDef | null>(null);

  const loadKeyboard = (kb: ZMKKeyboardDef) => {
    setLoading(true);
    setLoadError(null);
    readTextFile(kb.keymapPath)
      .then(text => {
        const km = parseKeymapText(text);
        setKeymap(km, kb.keymapPath);
        setSelectedLayer(0);
        setStatus({ msg: `Loaded ${kb.name} · ${km.layers.length} layers`, ok: true });
        setTimeout(() => setStatus(null), 2000);
      })
      .catch((err) => {
        setLoadError(String(err));
        setKeymap(null, kb.keymapPath);
      })
      .finally(() => setLoading(false));
  };

  const switchKeyboard = (kb: ZMKKeyboardDef, force = false) => {
    if (kb.id === keyboard.id && keymap) return;
    if (isDirty && !force) {
      setPendingSwitch(kb);
      return;
    }
    setPendingSwitch(null);
    setKeyboard(kb);
    setSelectedKeyboard(kb.id);
    setDirty(false);
    loadKeyboard(kb);
  };

  // Auto-load on mount
  useEffect(() => {
    if (keymap) { setLoading(false); return; }
    loadKeyboard(keyboard);
  }, []);

  const openFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'ZMK Keymap', extensions: ['keymap'] }],
      });
      if (!selected || Array.isArray(selected)) return;
      const text = await readTextFile(selected);
      const km = parseKeymapText(text);
      setKeymap(km, selected);
      setSelectedLayer(0);
      setStatus({ msg: `Loaded ${km.layers.length} layers`, ok: true });
    } catch (err) {
      setStatus({ msg: `Error: ${err}`, ok: false });
    }
  };

  const saveFile = async () => {
    if (!keymap || !filePath) return;
    try {
      let updated = updateLayerBindingsInSource(keymap.rawSource, keymap.layers);
      updated = updateCombosInSource(updated, keymap.combos);
      await writeTextFile(filePath, updated);
      setDirty(false);
      setStatus({ msg: 'Saved!', ok: true });
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus({ msg: `Error saving: ${err}`, ok: false });
    }
  };

  const handleBindingChange = (pos: number, newBinding: string) => {
    if (!keymap) return;
    // No-op edits shouldn't mark the keymap dirty
    if (keymap.layers[selectedLayer]?.keys[pos] === newBinding) return;
    updateLayerKey(selectedLayer, pos, newBinding);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Keyboard switcher */}
        <div className="seg-ctrl">
          {ZMK_KEYBOARDS.map(kb => (
            <button
              key={kb.id}
              className={`seg-btn${keyboard.id === kb.id ? ' active' : ''}`}
              onClick={() => switchKeyboard(kb)}
              title={kb.keymapPath}
            >
              {kb.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {kb.variant}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={openFile}>Open…</button>
        {keymap && (
          <>
            <span style={{
              fontSize: 11, color: 'var(--text-secondary)',
              fontFamily: 'monospace', maxWidth: 260,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={filePath ?? ''}>
              {(filePath ?? '').split('/').pop()}
            </span>
            {isDirty && (
              <span className="tag" style={{ color: 'var(--warning)', background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.25)' }}>
                Unsaved
              </span>
            )}
            <button className="btn btn-primary btn-sm" onClick={saveFile} disabled={!isDirty}>
              Save
            </button>
          </>
        )}
        {status && (
          <span style={{ fontSize: 12, color: status.ok ? 'var(--success)' : 'var(--danger)' }}>{status.msg}</span>
        )}
      </div>

      {/* Unsaved-changes guard when switching keyboards */}
      {pendingSwitch && (
        <div className="glass anim-fade-up" style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '10px 14px', borderColor: 'rgba(251,191,36,0.35)',
          fontSize: 12, color: 'var(--text)',
        }}>
          <span>
            Unsaved changes on <strong>{keyboard.name}</strong> — switch to{' '}
            <strong>{pendingSwitch.name}</strong> and discard them?
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => switchKeyboard(pendingSwitch, true)}>
            Discard &amp; switch
          </button>
          <button className="btn btn-secondary btn-sm" onClick={async () => { await saveFile(); switchKeyboard(pendingSwitch, true); }}>
            Save, then switch
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPendingSwitch(null)}>
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-secondary)', gap: 12 }}>
          <div style={{ fontSize: 40 }}>⌨️</div>
          <div style={{ fontSize: 14 }}>Loading {keyboard.name} keymap…</div>
        </div>
      ) : !keymap ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
          <div style={{ fontSize: 40 }}>⌨️</div>
          {loadError && (
            <div className="panel-inset" style={{ fontSize: 12, color: 'var(--danger)', background: 'rgba(251,113,133,0.08)', padding: '8px 12px', maxWidth: 500, wordBreak: 'break-all' }}>
              {loadError}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Could not auto-load <code style={{ fontFamily: 'monospace' }}>{keyboard.keymapPath}</code>
          </div>
          <button className="btn btn-primary" onClick={openFile}>Open .keymap manually</button>
        </div>
      ) : (
        <>
          {/* View switcher — one board at a time */}
          <div className="seg-ctrl" style={{ alignSelf: 'flex-start' }}>
            <button className={`seg-btn${view === 'keymap' ? ' active' : ''}`} onClick={() => setView('keymap')}>
              Keymap
            </button>
            <button className={`seg-btn${view === 'combos' ? ' active' : ''}`} onClick={() => setView('combos')}>
              Combos ({keymap.combos.length})
            </button>
          </div>

          {view === 'keymap' && (
            <>
              {/* Layer tabs + management */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginRight: 4 }}>Layer:</span>
                <div className="seg-ctrl" style={{ flexWrap: 'wrap' }}>
                  {keymap.layers.map((layer, idx) => (
                    <button
                      key={layer.name}
                      className={`seg-btn${selectedLayer === idx ? ' active' : ''}`}
                      onClick={() => setSelectedLayer(idx)}
                      title={`Layer ${idx} — ${layer.name}`}
                    >
                      <span style={{
                        fontSize: 9.5,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        opacity: selectedLayer === idx ? 0.9 : 0.45,
                        marginRight: 5,
                      }}>{idx}</span>
                      {layer.displayName ?? layer.name}
                    </button>
                  ))}
                </div>
                {/* New layer */}
                {addingLayer ? (
                  <form
                    style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                    onSubmit={e => {
                      e.preventDefault();
                      const name = newLayerName.trim().replace(/[^\w+]/g, '_');
                      if (!name) return;
                      if (keymap.layers.some(l => l.name === name || l.displayName === name)) {
                        setStatus({ msg: `Layer "${name}" already exists`, ok: false });
                        return;
                      }
                      const idx = addLayer(name);
                      if (idx >= 0) {
                        setStatus({ msg: `Layer ${idx} "${name}" created — all keys transparent`, ok: true });
                        setTimeout(() => setStatus(null), 2500);
                      }
                      setNewLayerName('');
                      setAddingLayer(false);
                    }}
                  >
                    <input
                      autoFocus
                      value={newLayerName}
                      onChange={e => setNewLayerName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') { setAddingLayer(false); setNewLayerName(''); } }}
                      placeholder="layer_name"
                      style={{ width: 130, height: 26, fontSize: 12, fontFamily: 'var(--font-mono)' }}
                    />
                    <button type="submit" className="btn btn-primary btn-sm">Create</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAddingLayer(false); setNewLayerName(''); }}>Cancel</button>
                  </form>
                ) : renamingLayer ? (
                  <form
                    style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                    onSubmit={e => {
                      e.preventDefault();
                      const name = renameValue.trim().replace(/[^\w+]/g, '_');
                      if (!name) return;
                      const err = renameLayer(selectedLayer, name);
                      setStatus(err ? { msg: err, ok: false } : { msg: `Renamed to "${name}"`, ok: true });
                      if (!err) setTimeout(() => setStatus(null), 2000);
                      setRenamingLayer(false);
                      setRenameValue('');
                    }}
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') { setRenamingLayer(false); setRenameValue(''); } }}
                      placeholder="new_name"
                      style={{ width: 130, height: 26, fontSize: 12, fontFamily: 'var(--font-mono)' }}
                    />
                    <button type="submit" className="btn btn-primary btn-sm">Rename</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRenamingLayer(false); setRenameValue(''); }}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => setAddingLayer(true)} title="Add a new empty layer">
                      + Layer
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title={`Rename layer ${selectedLayer}`}
                      onClick={() => {
                        setRenameValue(keymap.layers[selectedLayer]?.displayName ?? keymap.layers[selectedLayer]?.name ?? '');
                        setRenamingLayer(true);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                      title={`Delete layer ${selectedLayer} (blocked if referenced)`}
                      onClick={() => {
                        const l = keymap.layers[selectedLayer];
                        if (!window.confirm(`Delete layer ${selectedLayer} "${l?.displayName ?? l?.name}"? References to higher layers will be renumbered.`)) return;
                        const err = deleteLayer(selectedLayer);
                        setStatus(err ? { msg: err, ok: false } : { msg: 'Layer deleted — higher layer references renumbered', ok: true });
                        if (!err) setTimeout(() => setStatus(null), 3000);
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>

              {/* Keyboard */}
              <div className="glass anim-fade-up" style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Layer {selectedLayer}: {keymap.layers[selectedLayer]?.displayName ?? keymap.layers[selectedLayer]?.name}
                  <span style={{ fontWeight: 400, marginLeft: 8 }}>— click key to edit</span>
                </div>
                <SplitKeyboard
                  layer={keymap.layers[selectedLayer] ?? null}
                  onBindingChange={handleBindingChange}
                />
              </div>
            </>
          )}

          {view === 'combos' && (
            <div className="glass anim-fade-up" style={{ padding: '12px 16px' }}>
              <ComboEditor />
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── QMK Tab ──────────────────────────────────────────────────────────────────

const QMKTab: React.FC = () => {
  const { keymap, isDirty, loadError, load, updateLayerKey, save } = useQMKStore();
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  // Auto-load on mount
  useEffect(() => {
    if (keymap) return;
    load().then(() => {
      // Check store state after load — only show success if keymap actually loaded
      const state = useQMKStore.getState();
      if (state.keymap) {
        setStatus({ msg: 'QMK keymap loaded', ok: true });
        setTimeout(() => setStatus(null), 2000);
      }
    });
  }, []);

  const handleSave = async () => {
    try {
      await save();
      setStatus({ msg: 'Saved!', ok: true });
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus({ msg: `Error: ${err}`, ok: false });
    }
  };

  const handleBindingChange = (pos: number, newKeycode: string) => {
    updateLayerKey(selectedLayer, pos, newKeycode);
  };

  const currentLayer = keymap?.layers[selectedLayer];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          corne_procyon.layout.json
        </span>
        {isDirty && (
          <span className="tag" style={{ color: 'var(--warning)', background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.25)' }}>
            Unsaved
          </span>
        )}
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!isDirty}>
          Save
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => load()}>Reload</button>
        {status && (
          <span style={{ fontSize: 12, color: status.ok ? 'var(--success)' : 'var(--danger)' }}>{status.msg}</span>
        )}
      </div>

      {loadError ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: 12 }}>
          <div style={{ fontSize: 40 }}>⌨️</div>
          <div className="panel-inset" style={{ fontSize: 12, color: 'var(--danger)', background: 'rgba(251,113,133,0.08)', padding: '8px 12px', maxWidth: 500, wordBreak: 'break-all' }}>
            {loadError}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Could not auto-load <code style={{ fontFamily: 'monospace' }}>corne_procyon.layout.json</code>
          </div>
          <button className="btn btn-primary" onClick={() => load()}>Retry</button>
        </div>
      ) : !keymap ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-secondary)', gap: 12 }}>
          <div style={{ fontSize: 40 }}>⌨️</div>
          <div style={{ fontSize: 14 }}>Loading QMK keymap…</div>
        </div>
      ) : (
        <>
          {/* Layer tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginRight: 4 }}>Layer:</span>
            <div className="seg-ctrl" style={{ flexWrap: 'wrap' }}>
              {keymap.layers.map((layer, idx) => (
                <button
                  key={layer.name}
                  className={`seg-btn${selectedLayer === idx ? ' active' : ''}`}
                  onClick={() => setSelectedLayer(idx)}
                  title={`Layer ${idx} — ${layer.name}`}
                >
                  <span style={{
                    fontSize: 9.5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    opacity: selectedLayer === idx ? 0.9 : 0.45,
                    marginRight: 5,
                  }}>{idx}</span>
                  {layer.name}
                </button>
              ))}
            </div>
          </div>

          {/* Keyboard */}
          {currentLayer && (
            <div className="glass anim-fade-up" style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Layer {selectedLayer}: {currentLayer.name}
                <span style={{ fontWeight: 400, marginLeft: 8 }}>— click key to edit</span>
              </div>
              <QMKKeyboard
                keys={currentLayer.keys}
                onBindingChange={handleBindingChange}
              />
            </div>
          )}

          {/* Combo editor — full width below keyboard */}
          <div className="glass anim-fade-up" style={{ padding: '12px 16px' }}>
            <QMKComboEditor />
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = 'zmk' | 'qmk';

const ZMKEditor: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('zmk');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Header — same section-header pattern as Pointing/Settings */}
      <div className="section-header">
        <span className="section-title">Keymap Editor</span>
        <div className="seg-ctrl">
          <button className={`seg-btn${activeTab === 'zmk' ? ' active' : ''}`} onClick={() => setActiveTab('zmk')}>ZMK</button>
          <button className={`seg-btn${activeTab === 'qmk' ? ' active' : ''}`} onClick={() => setActiveTab('qmk')}>QMK</button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, padding: 24 }}>
        {activeTab === 'zmk' ? <ZMKTab /> : <QMKTab />}
      </div>
    </div>
  );
};

export default ZMKEditor;
