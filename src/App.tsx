import { useState, useEffect, useRef, Suspense, lazy, Component, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "@/components/Sidebar";
import { useZMKStore } from "@/stores/zmkStore";
import { useQMKStore } from "@/stores/qmkStore";
import { useRegistryStore } from "@/stores/registryStore";
import { syncDirty, isAnyDirty, dirtySources, saveAllDirty, discardAllDirty, onDirtyChange } from "@/lib/dirty";
import { IS_TAURI } from "@/lib/io";
import { useToast } from "@/components/ui";
import { loadSection, saveSection, sameSection, type Section } from "@/lib/nav";
import { initDevicetree } from "@/lib/zmkParser";
import treeSitterWasm from "web-tree-sitter/web-tree-sitter.wasm?url";
import devicetreeWasm from "tree-sitter-devicetree/tree-sitter-devicetree.wasm?url";

// Devicetree parser (WASM) — started at module load so it overlaps the
// registry read; keyboard sections wait on it.
const parserReady = initDevicetree({ runtime: treeSitterWasm, grammar: devicetreeWasm });

const KeyboardSection = lazy(() => import("@/components/Keyboard/KeyboardSection"));
const KarabinerEditor = lazy(() => import("@/components/KarabinerEditor"));
const Mouse = lazy(() => import("@/components/Mouse"));
const Settings = lazy(() => import("@/components/Settings"));
const Onboarding = lazy(() => import("@/components/Onboarding"));

useZMKStore.subscribe(syncDirty);
useQMKStore.subscribe(syncDirty);

function LoadingFallback() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}>
      <div className="skeleton" style={{ width: 220, height: 14 }} />
      <div className="skeleton" style={{ width: 320, height: 14 }} />
      <div className="skeleton" style={{ width: 260, height: 14 }} />
    </div>
  );
}

class SectionErrorBoundary extends Component<{ section: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { section: string }) {
    if (prev.section !== this.props.section && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, padding: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Something went wrong in this section</div>
          <div className="panel-inset" style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--danger)", maxWidth: 560, wordBreak: "break-word" }}>
            {String(this.state.error)}
          </div>
          <button className="btn btn-secondary" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const registry = useRegistryStore();
  const [section, setSection] = useState<Section | null>(null);
  const [pending, setPending] = useState<Section | null>(null);
  const toast = useToast();
  // latest values for the global key handler (registered once)
  const sectionRef = useRef(section); sectionRef.current = section;
  const registryRef = useRef(registry); registryRef.current = registry;
  const [dirtyNames, setDirtyNames] = useState<string[]>([]);
  const [parserState, setParserState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [parserError, setParserError] = useState<string | null>(null);
  useEffect(() => {
    parserReady.then(() => setParserState('ready')).catch(e => { setParserError(String(e)); setParserState('failed') });
  }, []);

  // Load the registry, then resolve the initial section.
  useEffect(() => {
    registry.load().then(() => {
      const { keyboards, selectedId } = useRegistryStore.getState();
      const saved = loadSection();
      if (saved && (saved.kind !== 'keyboard' || keyboards.some(k => k.id === saved.id))) { setSection(saved); return; }
      if (keyboards.length === 0) { setSection({ kind: 'onboarding' }); return; }
      setSection({ kind: 'keyboard', id: selectedId ?? keyboards[0].id });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => onDirtyChange(() => setDirtyNames(dirtySources())), []);

  // A removed keyboard or an emptied registry moves the user somewhere valid.
  useEffect(() => {
    if (!section || !registry.loaded) return;
    if (section.kind === 'keyboard' && !registry.keyboards.some(k => k.id === section.id)) {
      setSection(registry.keyboards[0] ? { kind: 'keyboard', id: registry.keyboards[0].id } : { kind: 'onboarding' });
    }
    if (section.kind === 'onboarding' && registry.keyboards.length > 0) {
      setSection({ kind: 'keyboard', id: registry.keyboards[0].id });
    }
  }, [section, registry.keyboards, registry.loaded]);

  const go = (s: Section) => {
    setPending(null);
    setSection(s);
    saveSection(s);
    if (s.kind === 'keyboard') registry.select(s.id);
  };

  /** Navigate, but hold at a banner when leaving unsaved edits behind. */
  const navigate = (s: Section) => {
    if (section && sameSection(s, section)) { if (s.kind === 'settings' && (s.add || s.edit)) setSection({ ...s, n: Date.now() }); return; }
    if (isAnyDirty()) { setPending(s); return; }
    go(s);
  };

  // Guard against silently losing unsaved edits on reload/close (web build;
  // the desktop quit path is handled natively via the dirty registry).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (isAnyDirty()) e.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Resume the native scroll engine at launch from the persisted config.
  useEffect(() => {
    if (!IS_TAURI) return;
    try {
      const raw = localStorage.getItem("uk.mouseConfig");
      if (!raw) return;
      const config = JSON.parse(raw) as { enabled?: boolean; reverse?: boolean; speed?: number };
      if (config.enabled) {
        invoke("set_mouse_config", { config: { enabled: true, reverse: !!config.reverse, speed: Number(config.speed) || 1 } })
          .catch(() => toast.error("The scroll engine could not start. Open This Mac › Scroll & Mouse to allow Accessibility access."));
      }
    } catch { /* ignore corrupt config */ }
  }, []);

  // Cmd+S saves everything dirty; Cmd+Z / Shift+Cmd+Z undo/redo keymap edits
  // (unless focus is in a text field, where the browser's own undo applies).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        if (isAnyDirty()) saveAllDirty().then(() => toast.success('Saved')).catch(err => toast.error(`Not saved: ${err instanceof Error ? err.message : err}`));
        return;
      }
      if (k === 'z') {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        // only the ZMK keymap editor has undo; elsewhere leave the key alone
        const cur = sectionRef.current;
        const kb = cur?.kind === 'keyboard' ? registryRef.current.keyboards.find(k => k.id === cur.id) : null;
        if (kb?.firmware !== 'zmk') return;
        e.preventDefault();
        if (e.shiftKey) useZMKStore.getState().redo(); else useZMKStore.getState().undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const key = section ? (section.kind === 'keyboard' ? `keyboard:${section.id}` : section.kind) : 'loading';
  const activeKeyboard = section?.kind === 'keyboard' ? registry.keyboards.find(k => k.id === section.id) ?? null : null;

  return (
    <div className="app-layout">
      <Sidebar keyboards={registry.keyboards} active={section ?? { kind: 'onboarding' }} onNavigate={navigate} />
      <main className="app-main">
        {registry.error && (
          <div className="panel-inset" role="alert" style={{ margin: '12px 24px 0', padding: '10px 14px', fontSize: 12, color: 'var(--danger)', borderColor: 'rgba(251,113,133,0.35)' }}>
            {registry.error}
          </div>
        )}
        {pending && (
          <div className="glass anim-fade-up" role="alertdialog" style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            margin: '12px 24px 0', padding: '10px 14px', fontSize: 12,
            borderColor: 'rgba(251,191,36,0.35)',
          }}>
            <span>Unsaved changes in <strong>{dirtyNames.join(', ') || 'this section'}</strong>.</span>
            <button className="btn btn-secondary btn-sm" onClick={async () => { try { await saveAllDirty(); go(pending) } catch (e) { toast.error(`Not saved, so you are still here: ${e instanceof Error ? e.message : e}`) } }}>Save, then switch</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { discardAllDirty(); go(pending) }}>Discard &amp; switch</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPending(null)}>Cancel</button>
          </div>
        )}
        <Suspense fallback={<LoadingFallback />}>
          <SectionErrorBoundary section={key}>
            <div key={key} className="anim-fade-up" style={{ height: "100%" }}>
              {!section ? <LoadingFallback /> :
                section.kind === 'keyboard' ? (
                  parserState === 'failed' ? (
                    <div className="panel-inset" role="alert" style={{ margin: 24, padding: '12px 16px', fontSize: 12, color: 'var(--danger)' }}>
                      The keymap parser failed to load: {parserError}
                    </div>
                  ) : parserState === 'loading' || !activeKeyboard ? <LoadingFallback /> :
                  <KeyboardSection keyboard={activeKeyboard} onEditInSettings={() => navigate({ kind: 'settings', edit: activeKeyboard.id })} />
                ) :
                section.kind === 'karabiner' ? <KarabinerEditor /> :
                section.kind === 'mouse' ? <Mouse /> :
                section.kind === 'settings' ? <Settings key={section.n ?? 0} startAdd={section.add} startEdit={section.edit} onAdded={(id) => go({ kind: 'keyboard', id })} /> :
                <Onboarding onAddFromFolder={() => go({ kind: 'settings', add: 'folder' })} onAddFromFile={() => go({ kind: 'settings', add: 'file' })} />}
            </div>
          </SectionErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
