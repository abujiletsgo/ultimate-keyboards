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

// ─── Shared styles ────────────────────────────────────────────────────────────

const btnStyle = (active = false): React.CSSProperties => ({
  padding: '5px 16px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: active ? 700 : 400,
  backgroundColor: active ? 'var(--accent, #7c6aff)' : 'var(--bg-secondary, #2a2a2a)',
  color: active ? '#fff' : 'var(--text-secondary, #aaa)',
  transition: 'background-color 0.15s',
  whiteSpace: 'nowrap' as const,
});

const actionBtnStyle: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 6,
  border: '1px solid var(--border, #3a3a3a)',
  cursor: 'pointer',
  fontSize: 12,
  backgroundColor: 'var(--bg-secondary, #2a2a2a)',
  color: 'var(--text-primary, #eee)',
};

const primaryBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  backgroundColor: 'var(--accent, #7c6aff)',
  color: '#fff',
  border: 'none',
};

// ─── ZMK Tab ──────────────────────────────────────────────────────────────────

const ZMKTab: React.FC = () => {
  const { keymap, filePath, isDirty, setKeymap, setDirty, updateLayerKey } = useZMKStore();
  const [keyboard, setKeyboard] = useState<ZMKKeyboardDef>(getSelectedKeyboard);
  const [selectedLayer, setSelectedLayer] = useState(0);
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
    updateLayerKey(selectedLayer, pos, newBinding);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Keyboard switcher */}
        <div style={{ display: 'flex', gap: 4 }}>
          {ZMK_KEYBOARDS.map(kb => (
            <button
              key={kb.id}
              style={btnStyle(keyboard.id === kb.id)}
              onClick={() => switchKeyboard(kb)}
              title={kb.keymapPath}
            >
              {kb.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {kb.variant}</span>
            </button>
          ))}
        </div>
        <button style={actionBtnStyle} onClick={openFile}>Open…</button>
        {keymap && (
          <>
            <span style={{
              fontSize: 11, color: 'var(--text-secondary, #aaa)',
              fontFamily: 'monospace', maxWidth: 260,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={filePath ?? ''}>
              {(filePath ?? '').split('/').pop()}
            </span>
            {isDirty && (
              <span style={{ fontSize: 11, color: '#f5a623', background: 'rgba(245,166,35,0.12)', borderRadius: 4, padding: '2px 7px' }}>
                Unsaved
              </span>
            )}
            <button style={{ ...primaryBtnStyle, opacity: isDirty ? 1 : 0.5 }} onClick={saveFile} disabled={!isDirty}>
              Save
            </button>
          </>
        )}
        {status && (
          <span style={{ fontSize: 12, color: status.ok ? '#6fcf97' : '#ff6b6b' }}>{status.msg}</span>
        )}
      </div>

      {/* Unsaved-changes guard when switching keyboards */}
      {pendingSwitch && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(245,166,35,0.10)', border: '1px solid rgba(245,166,35,0.35)',
          fontSize: 12, color: 'var(--text, #eee)',
        }}>
          <span>
            Unsaved changes on <strong>{keyboard.name}</strong> — switch to{' '}
            <strong>{pendingSwitch.name}</strong> and discard them?
          </span>
          <button style={{ ...actionBtnStyle, fontSize: 11 }} onClick={() => switchKeyboard(pendingSwitch, true)}>
            Discard &amp; switch
          </button>
          <button style={{ ...actionBtnStyle, fontSize: 11 }} onClick={async () => { await saveFile(); switchKeyboard(pendingSwitch, true); }}>
            Save, then switch
          </button>
          <button style={{ ...actionBtnStyle, fontSize: 11 }} onClick={() => setPendingSwitch(null)}>
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-secondary, #aaa)', gap: 12 }}>
          <div style={{ fontSize: 40 }}>⌨️</div>
          <div style={{ fontSize: 14 }}>Loading {keyboard.name} keymap…</div>
        </div>
      ) : !keymap ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
          <div style={{ fontSize: 40 }}>⌨️</div>
          {loadError && (
            <div style={{ fontSize: 12, color: '#ff6b6b', background: 'rgba(255,80,80,0.08)', borderRadius: 6, padding: '8px 12px', maxWidth: 500, wordBreak: 'break-all' }}>
              {loadError}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
            Could not auto-load <code style={{ fontFamily: 'monospace' }}>{keyboard.keymapPath}</code>
          </div>
          <button style={primaryBtnStyle} onClick={openFile}>Open .keymap manually</button>
        </div>
      ) : (
        <>
          {/* Layer tabs */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)', marginRight: 4 }}>Layer:</span>
            {keymap.layers.map((layer, idx) => (
              <button
                key={layer.name}
                style={btnStyle(selectedLayer === idx)}
                onClick={() => setSelectedLayer(idx)}
              >
                {layer.displayName ?? layer.name}
              </button>
            ))}
          </div>

          {/* Keyboard */}
          <div style={{
            background: 'var(--bg-secondary, #1e1e1e)',
            border: '1px solid var(--border, #3a3a3a)',
            borderRadius: 10,
            padding: '12px 16px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Layer {selectedLayer}: {keymap.layers[selectedLayer]?.displayName ?? keymap.layers[selectedLayer]?.name}
              <span style={{ fontWeight: 400, marginLeft: 8 }}>— click key to edit</span>
            </div>
            <SplitKeyboard
              layer={keymap.layers[selectedLayer] ?? null}
              onBindingChange={handleBindingChange}
            />
          </div>

          {/* Combo editor — full width below keyboard */}
          <div style={{
            background: 'var(--bg-secondary, #1e1e1e)',
            border: '1px solid var(--border, #3a3a3a)',
            borderRadius: 10,
            padding: '12px 16px',
          }}>
            <ComboEditor />
          </div>
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
        <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)', fontFamily: 'monospace' }}>
          corne_procyon.layout.json
        </span>
        {isDirty && (
          <span style={{ fontSize: 11, color: '#f5a623', background: 'rgba(245,166,35,0.12)', borderRadius: 4, padding: '2px 7px' }}>
            Unsaved
          </span>
        )}
        <button style={{ ...primaryBtnStyle, opacity: isDirty ? 1 : 0.5 }} onClick={handleSave} disabled={!isDirty}>
          Save
        </button>
        <button style={actionBtnStyle} onClick={() => load()}>Reload</button>
        {status && (
          <span style={{ fontSize: 12, color: status.ok ? '#6fcf97' : '#ff6b6b' }}>{status.msg}</span>
        )}
      </div>

      {loadError ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: 12 }}>
          <div style={{ fontSize: 40 }}>⌨️</div>
          <div style={{ fontSize: 12, color: '#ff6b6b', background: 'rgba(255,80,80,0.08)', borderRadius: 6, padding: '8px 12px', maxWidth: 500, wordBreak: 'break-all' }}>
            {loadError}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
            Could not auto-load <code style={{ fontFamily: 'monospace' }}>corne_procyon.layout.json</code>
          </div>
          <button style={primaryBtnStyle} onClick={() => load()}>Retry</button>
        </div>
      ) : !keymap ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-secondary, #aaa)', gap: 12 }}>
          <div style={{ fontSize: 40 }}>⌨️</div>
          <div style={{ fontSize: 14 }}>Loading QMK keymap…</div>
        </div>
      ) : (
        <>
          {/* Layer tabs */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)', marginRight: 4 }}>Layer:</span>
            {keymap.layers.map((layer, idx) => (
              <button
                key={layer.name}
                style={btnStyle(selectedLayer === idx)}
                onClick={() => setSelectedLayer(idx)}
              >
                {layer.name}
              </button>
            ))}
          </div>

          {/* Keyboard */}
          {currentLayer && (
            <div style={{
              background: 'var(--bg-secondary, #1e1e1e)',
              border: '1px solid var(--border, #3a3a3a)',
              borderRadius: 10,
              padding: '12px 16px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
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
          <div style={{
            background: 'var(--bg-secondary, #1e1e1e)',
            border: '1px solid var(--border, #3a3a3a)',
            borderRadius: 10,
            padding: '12px 16px',
          }}>
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: 24,
      height: '100%',
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <h2 style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary, #eee)' }}>
            Keymap Editor
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary, #aaa)' }}>
            Visual editor for your ZMK keyboards (Corne · Crosses) and QMK (corne_procyon)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button style={btnStyle(activeTab === 'zmk')} onClick={() => setActiveTab('zmk')}>ZMK</button>
          <button style={btnStyle(activeTab === 'qmk')} onClick={() => setActiveTab('qmk')}>QMK</button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1 }}>
        {activeTab === 'zmk' ? <ZMKTab /> : <QMKTab />}
      </div>
    </div>
  );
};

export default ZMKEditor;
