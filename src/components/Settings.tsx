import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Pencil, Trash2, FolderOpen, FileText } from "lucide-react";
import { useRegistryStore } from "@/stores/registryStore";
import { IS_TAURI } from "@/lib/io";
import { CATALOGUE, catalogueLabel } from "@/lib/layout/catalogue";
import { parseInfoJsonLayouts, parseKle, type PhysicalLayout } from "@/lib/layout";
import { readText } from "@/lib/io";
import type { KeyboardDef } from "@/lib/registry/types";
import AddKeyboard from "./Settings/AddKeyboard";
import Updates from "./Settings/Updates";
import Supported from "./Settings/Supported";
import PhysicalBoard from "@/components/board/PhysicalBoard";

interface Props {
  /** Open the add-keyboard flow immediately (from the sidebar / onboarding). */
  startAdd?: boolean
  onAdded?: (id: string) => void
}

export default function Settings({ startAdd, onAdded }: Props) {
  const { keyboards, add, update, remove } = useRegistryStore();
  const [adding, setAdding] = useState<'folder' | 'file' | null>(startAdd ? 'folder' : null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => { if (startAdd) setAdding('folder') }, [startAdd]);

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div className="section-header">
        <span className="section-title">Settings</span>
      </div>

      <div style={{ padding: "24px", maxWidth: "720px", margin: "0 auto" }}>
        <Section title="Keyboards">
          {keyboards.length === 0 && !adding && (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No keyboards registered yet.</div>
          )}
          {keyboards.map(kb => (
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
            <AddKeyboard
              mode={adding}
              existingNames={keyboards.map(k => k.name)}
              onAdd={(def) => { const kb = add(def); setAdding(null); onAdded?.(kb.id) }}
              onCancel={() => setAdding(null)}
            />
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm" onClick={() => setAdding('folder')}>
                <FolderOpen size={14} /> Add from config folder…
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setAdding('file')}>
                <FileText size={14} /> Add from .keymap file…
              </button>
            </div>
          )}
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Keymap and overlay files are read from and saved to the folders you pick. Nothing is copied.
          </div>
        </Section>

        <Section title="MacBook Keyboard">
          <BuiltInKeyboardField />
        </Section>

        <Section title="Updates">
          <Updates />
        </Section>

        <Section title="What is supported">
          <Supported />
        </Section>

        <Section title="About">
          <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.8" }}>
            <p><strong style={{ color: "var(--text)" }}>Ultimate Keyboards</strong> v{__APP_VERSION__}</p>
            <p>ZMK / QMK keymap editor, pointing-device tuner, and Karabiner-Elements configurator.</p>
            <p style={{ marginTop: "8px" }}>Built with Tauri v2 + React 19 + TypeScript. {CATALOGUE.length} physical layouts bundled from ZMK.</p>
            <p>MIT licensed. Source and release notes: github.com/abujiletsgo/ultimate-keyboards</p>
          </div>
        </Section>
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
  const [layoutId, setLayoutId] = useState<string>('current');
  const [imported, setImported] = useState<PhysicalLayout | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  useEffect(() => { setName(kb.name); setKeymapPath(kb.keymapPath); setKeymapCPath(kb.keymapCPath ?? ''); setLayoutId('current'); setImported(null); setImportError(null) }, [kb, editing]);

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
          <div style={{ fontSize: 13, fontWeight: 600 }}>{kb.name} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>· {kb.firmware.toUpperCase()} · {kb.layout.keys.length} keys{kb.pointing.length ? ` · ${kb.pointing.map(p => p.name.toLowerCase()).join(', ')}` : ''}</span></div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={kb.keymapPath}>{kb.keymapPath}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onEdit} aria-label={`Edit ${kb.name}`} title="Rename, change files or layout"><Pencil size={13} /> Edit</button>
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
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--text-secondary)" }}>Physical layout</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={layoutId} onChange={e => setLayoutId(e.target.value)} style={{ height: 30, flex: 1 }}>
                <option value="current">Current: {kb.layout.name} ({kb.layout.keys.length} keys, {kb.layout.source})</option>
                {imported && <option value="imported">Imported: {imported.name} ({imported.keys.length} keys)</option>}
                {sameCount.map(e => <option key={e.id} value={e.id}>{catalogueLabel(e)}</option>)}
              </select>
              <button className="btn btn-secondary btn-sm" onClick={importLayoutFile} title="info.json (QMK / keymap-editor) or keyboard-layout-editor JSON">Import file…</button>
            </div>
            {importError && <span style={{ color: "var(--danger)", fontSize: 11 }}>{importError}</span>}
          </label>
          <div className="panel-inset" style={{ padding: 6 }}>
            <PhysicalBoard layout={chosenLayout} keyAt={(i) => ({ label: String(i), text: 'rgba(226,230,255,0.45)', fontSize: 9 })} editable={false} maxScale={0.7} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={!name.trim() || !keymapPath.trim()} onClick={() => onSave({
              name: name.trim(), keymapPath: keymapPath.trim(), keymapCPath: keymapCPath.trim() || undefined,
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <h2 className="section-title" style={{ marginBottom: "12px" }}>{title}</h2>
      <div className="glass anim-fade-up" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "6px" }}>
        <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>{label}</label>
        {hint && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

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
    return (
      <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
        Available in the desktop app — disable the built-in MacBook keyboard so a
        split keyboard placed on top of it doesn&rsquo;t mistype.
      </div>
    );
  }

  return (
    <Field label="Disable built-in keyboard" hint={disabled ? "Built-in keyboard OFF" : "Built-in keyboard on"}>
      <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: busy ? "wait" : "pointer" }}>
        <input type="checkbox" checked={disabled} disabled={busy} onChange={(e) => toggle(e.target.checked)}
          style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
        <span aria-hidden style={{
          width: 40, height: 22, borderRadius: 11, position: "relative", flexShrink: 0,
          background: disabled ? "var(--accent)" : "rgba(255,255,255,0.12)",
          transition: "background var(--dur-2) var(--ease-spring)",
        }}>
          <span style={{
            position: "absolute", top: 3, left: disabled ? 21 : 3, width: 16, height: 16, borderRadius: 8,
            background: "#fff", transition: "left var(--dur-2) var(--ease-spring)",
          }} />
        </span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Mute the MacBook&rsquo;s own keys while a split keyboard sits on top of it. Restored automatically on quit, and on the next launch after a crash.
        </span>
      </label>
      {error && <div className="panel-inset" role="alert" style={{ marginTop: 8, padding: "8px 12px", fontSize: 12, color: "var(--danger)" }}>{error}</div>}
    </Field>
  );
}
