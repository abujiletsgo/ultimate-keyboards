import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Pencil, Trash2, Plus } from "lucide-react";
import { useRegistryStore } from "@/stores/registryStore";
import { IS_TAURI } from "@/lib/io";
import { CATALOGUE, catalogueLabel } from "@/lib/layout/catalogue";
import { parseInfoJsonLayouts, parseKle, type PhysicalLayout } from "@/lib/layout";
import { readText } from "@/lib/io";
import type { KeyboardDef } from "@/lib/registry/types";
import AddKeyboardHub, { type HubTab } from "./Settings/AddKeyboardHub";
import Updates from "./Settings/Updates";
import Supported from "./Settings/Supported";
import PhysicalBoard from "@/components/board/PhysicalBoard";
import { Switch } from "@/components/ui";

type Tab = 'keyboards' | 'macbook' | 'updates' | 'about'
const TABS: { id: Tab; label: string }[] = [
  { id: 'keyboards', label: 'Keyboards' },
  { id: 'macbook', label: 'MacBook' },
  { id: 'updates', label: 'Updates' },
  { id: 'about', label: 'About' },
]

interface Props {
  /** Open the add-keyboard flow immediately (from the sidebar / onboarding). */
  startAdd?: HubTab
  /** Open this keyboard's editor (from the keyboard page's Edit button). */
  startEdit?: string
  onAdded?: (id: string) => void
}

export default function Settings({ startAdd, startEdit, onAdded }: Props) {
  const { keyboards, add, update, remove } = useRegistryStore();
  const [tab, setTab] = useState<Tab>('keyboards');
  const [adding, setAdding] = useState<HubTab | null>(startAdd ?? null);
  const [editingId, setEditingId] = useState<string | null>(startEdit ?? null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => { if (startAdd) { setTab('keyboards'); setAdding(startAdd) } }, [startAdd]);
  useEffect(() => { if (startEdit) { setTab('keyboards'); setEditingId(startEdit) } }, [startEdit]);

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div className="section-header">
        <span className="section-title">Settings</span>
        <div className="seg-ctrl" role="tablist" aria-label="Settings sections">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`seg-btn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "24px", maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {tab === 'keyboards' && (
          <>
            {keyboards.length === 0 && !adding && (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No keyboards yet. Add one to start editing its keymap.</div>
            )}
            {!adding && keyboards.map(kb => (
              <KeyboardRow
                key={kb.id}
                kb={kb}
                editing={editingId === kb.id}
                onEdit={() => setEditingId(editingId === kb.id ? null : kb.id)}
                onSave={(patch) => { update(kb.id, patch); setEditingId(null) }}
                confirming={confirmRemove === kb.id}
                onAskRemove={() => setConfirmRemove(kb.id)}
                onCancelRemove={() => setConfirmRemove(null)}
                onRemove={() => { remove(kb.id); setConfirmRemove(null) }}
              />
            ))}
            {adding ? (
              <AddKeyboardHub
                key={adding}
                initial={adding}
                existingNames={keyboards.map(k => k.name)}
                onAdd={(def) => { const kb = add(def); setAdding(null); onAdded?.(kb.id) }}
                onClose={() => setAdding(null)}
              />
            ) : (
              <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => setAdding('find')}>
                <Plus size={14} /> Add keyboard…
              </button>
            )}
          </>
        )}

        {tab === 'macbook' && (
          <div className="glass" style={{ padding: 18 }}>
            <BuiltInKeyboardField />
          </div>
        )}

        {tab === 'updates' && (
          <div className="glass" style={{ padding: 18 }}>
            <Updates />
          </div>
        )}

        {tab === 'about' && (
          <>
            <div className="glass" style={{ padding: 18, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
              <p><strong style={{ color: "var(--text)" }}>Ultimate Keyboards</strong> v{__APP_VERSION__}</p>
              <p>Edit ZMK and QMK keyboards, tune trackpads and trackballs, and remap the MacBook keyboard.</p>
              <p>MIT licensed · github.com/abujiletsgo/ultimate-keyboards · {CATALOGUE.length} layouts bundled from ZMK</p>
            </div>
            <details className="glass" style={{ padding: "14px 18px" }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>What is supported</summary>
              <div style={{ marginTop: 14 }}><Supported /></div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

// ── Keyboard row (view / edit) ───────────────────────────────────────────────

function KeyboardRow({ kb, editing, onEdit, onSave, confirming, onAskRemove, onCancelRemove, onRemove }: {
  kb: KeyboardDef
  editing: boolean
  onEdit: () => void
  onSave: (patch: Partial<KeyboardDef>) => void
  confirming: boolean
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
}) {
  const [name, setName] = useState(kb.name);
  const [keymapPath, setKeymapPath] = useState(kb.keymapPath);
  const [keymapCPath, setKeymapCPath] = useState(kb.keymapCPath ?? '');
  const [repoPath, setRepoPath] = useState(kb.repoPath ?? '');
  const [layoutId, setLayoutId] = useState<string>('current');
  const [imported, setImported] = useState<PhysicalLayout | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  useEffect(() => { setName(kb.name); setRepoPath(kb.repoPath ?? ''); setKeymapPath(kb.keymapPath); setKeymapCPath(kb.keymapCPath ?? ''); setLayoutId('current'); setImported(null); setImportError(null) }, [kb, editing]);

  const sameCount = useMemo(() => CATALOGUE.filter(e => e.keyCount === kb.layout.keys.length), [kb.layout.keys.length]);
  const chosenLayout = layoutId === 'current' ? kb.layout : layoutId === 'imported' && imported ? imported : CATALOGUE.find(e => e.id === layoutId)?.layout ?? kb.layout;

  /** Import a layout file: QMK/keymap-editor info.json (any layout with a matching key count, else the first) or KLE JSON. */
  const importLayoutFile = async () => {
    setImportError(null);
    const f = await open({ multiple: false, filters: [{ name: 'Layout JSON (info.json / KLE)', extensions: ['json'] }] });
    if (!f || Array.isArray(f)) return;
    try {
      const text = await readText(f);
      const parsed = JSON.parse(text);
      let layout: PhysicalLayout | null = null;
      if (Array.isArray(parsed)) {
        layout = parseKle(parsed, f.split('/').pop() ?? 'KLE', f);
      } else {
        const ls = parseInfoJsonLayouts(text, f);
        const match = ls.find(l => l.layout.keys.length === kb.layout.keys.length) ?? ls[0];
        if (match) layout = { ...match.layout, name: `${f.split('/').pop()} · ${match.id}` };
      }
      if (!layout || layout.keys.length === 0) { setImportError('No layout found in that file (expected info.json "layouts" or a KLE array).'); return }
      if (layout.keys.length !== kb.layout.keys.length) { setImportError(`That layout has ${layout.keys.length} keys but this keyboard's keymap has ${kb.layout.keys.length}.`); return }
      setImported(layout); setLayoutId('imported');
    } catch (e) { setImportError(String(e)) }
  };

  const pickFile = async (setter: (p: string) => void, ext: string[]) => {
    const f = await open({ multiple: false, filters: [{ name: ext.join('/'), extensions: ext }] });
    if (f && !Array.isArray(f)) setter(f);
  };

  return (
    <div className="panel-inset" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            {kb.name}
            <span className={`fw-badge fw-${kb.firmware}`}>{kb.firmware.toUpperCase()}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }} title={kb.keymapPath}>
            {kb.layout.keys.length} keys{kb.pointing.length ? ` · ${kb.pointing.map(p => p.name.toLowerCase()).join(', ')}` : ''} · {(kb.repoPath ?? kb.keymapPath).split('/').filter(Boolean).pop()}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onEdit} aria-label={`Edit ${kb.name}`} aria-expanded={editing}><Pencil size={13} /> {editing ? 'Close' : 'Edit'}</button>
        <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={onAskRemove} aria-label={`Remove ${kb.name}`} title="Remove from the app (files are not touched)"><Trash2 size={13} /></button>
      </div>

      {confirming && (
        <div className="glass" role="alertdialog" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", fontSize: 12, borderColor: "rgba(251,113,133,0.35)" }}>
          <span>Remove <strong>{kb.name}</strong> from Ultimate Keyboards? Its files stay on disk.</span>
          <button className="btn btn-danger btn-sm" onClick={onRemove}>Remove</button>
          <button className="btn btn-ghost btn-sm" onClick={onCancelRemove}>Cancel</button>
        </div>
      )}

      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>Name</span>
            <input value={name} onChange={e => setName(e.target.value)} style={{ height: 30, fontSize: 13 }} />
          </label>
          <details>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Files</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>Config folder (for Build and Pointing)</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={repoPath} onChange={e => setRepoPath(e.target.value)} className="mono" placeholder="none" style={{ height: 30, fontSize: 11, flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={async () => { const d = await open({ directory: true, multiple: false }); if (d && !Array.isArray(d)) setRepoPath(d) }}>Choose…</button>
            </div>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>{kb.firmware === 'zmk' ? 'Keymap file (.keymap)' : 'Layout JSON (VIA)'}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={keymapPath} onChange={e => setKeymapPath(e.target.value)} className="mono" style={{ height: 30, fontSize: 11, flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={() => pickFile(setKeymapPath, kb.firmware === 'zmk' ? ['keymap'] : ['json'])}>Browse…</button>
            </div>
          </label>
          {kb.firmware === 'qmk' && (
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>keymap.c (for combos, optional)</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={keymapCPath} onChange={e => setKeymapCPath(e.target.value)} className="mono" style={{ height: 30, fontSize: 11, flex: 1 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => pickFile(setKeymapCPath, ['c'])}>Browse…</button>
              </div>
            </label>
          )}
          </div>
          </details>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>Physical layout</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={layoutId} onChange={e => setLayoutId(e.target.value)} style={{ height: 30, flex: 1 }}>
                <option value="current">{kb.layout.name} (current)</option>
                {imported && <option value="imported">Imported: {imported.name} ({imported.keys.length} keys)</option>}
                {sameCount.map(e => <option key={e.id} value={e.id}>{catalogueLabel(e)}</option>)}
              </select>
              <button className="btn btn-secondary btn-sm" onClick={importLayoutFile} title="info.json (QMK / keymap-editor) or keyboard-layout-editor JSON">From file…</button>
            </div>
            {importError && <span style={{ color: "var(--danger)", fontSize: 11 }}>{importError}</span>}
          </label>
          <div className="panel-inset" style={{ padding: 6 }}>
            <PhysicalBoard layout={chosenLayout} keyAt={(i) => ({ label: String(i), text: 'rgba(226,230,255,0.45)', fontSize: 9 })} editable={false} maxScale={0.7} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={!name.trim() || !keymapPath.trim()} onClick={() => onSave({
              name: name.trim(), keymapPath: keymapPath.trim(), keymapCPath: keymapCPath.trim() || undefined, repoPath: repoPath.trim() || undefined,
              ...(layoutId !== 'current' ? { layout: chosenLayout } : {}),
            })}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={onEdit}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

// Toggle for disabling the MacBook's built-in keyboard (so a split keyboard
// resting on top of it doesn't register stray keypresses). The same toggle
// lives in the menu-bar status icon.
function BuiltInKeyboardField() {
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten: (() => void) | undefined;
    invoke<boolean>("is_builtin_keyboard_disabled").then(setDisabled).catch(() => {});
    listen<boolean>("builtin-keyboard-changed", (e) => setDisabled(e.payload))
      .then((un) => { unlisten = un; })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  async function toggle(next: boolean) {
    if (!IS_TAURI || busy) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("set_builtin_keyboard_disabled", { disabled: next });
      setDisabled(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!IS_TAURI) {
    return <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Available in the desktop app.</div>;
  }

  return (
    <>
      <Switch
        checked={disabled}
        busy={busy}
        onChange={toggle}
        label="Turn off the MacBook keyboard"
        description="Stops stray key presses while a split keyboard rests on top of it. It turns back on when you quit the app, or on the next launch after a crash. Also in the menu-bar icon."
      />
      {error && <div className="panel-inset" role="alert" style={{ marginTop: 8, padding: "8px 12px", fontSize: 12, color: "var(--danger)" }}>{error}</div>}
    </>
  );
}
