import { useState, useEffect, Suspense, lazy, Component, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "@/components/Sidebar";
import { useZMKStore } from "@/stores/zmkStore";
import { useQMKStore } from "@/stores/qmkStore";
import { registerDirtySource, syncDirty, isAnyDirty } from "@/lib/dirty";
import { IS_TAURI } from "@/lib/io";

// Sections with a store register once; component-held state (Pointing)
// registers from its own effect.
registerDirtySource("zmk", () => useZMKStore.getState().isDirty);
registerDirtySource("qmk", () => useQMKStore.getState().isDirty);
useZMKStore.subscribe(syncDirty);
useQMKStore.subscribe(syncDirty);

const ZMKEditor = lazy(() => import("@/components/ZMKEditor"));
const KarabinerEditor = lazy(() => import("@/components/KarabinerEditor"));
const Pointing = lazy(() => import("@/components/Pointing"));
const Mouse = lazy(() => import("@/components/Mouse"));
const Settings = lazy(() => import("@/components/Settings"));

export type Section = "zmk" | "karabiner" | "pointing" | "mouse" | "settings";

function LoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 14,
      }}
    >
      <div className="skeleton" style={{ width: 220, height: 14 }} />
      <div className="skeleton" style={{ width: 320, height: 14 }} />
      <div className="skeleton" style={{ width: 260, height: 14 }} />
    </div>
  );
}

class SectionErrorBoundary extends Component<
  { section: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { section: string }) {
    // Reset when navigating to a different section
    if (prev.section !== this.props.section && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", gap: 14, padding: 40,
        }}>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Something went wrong in this section</div>
          <div className="panel-inset" style={{
            padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--danger)", maxWidth: 560, wordBreak: "break-word",
          }}>
            {String(this.state.error)}
          </div>
          <button className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const SECTION_KEY = "uk.activeSection";
const SECTIONS: Section[] = ["zmk", "karabiner", "pointing", "mouse", "settings"];

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>(() => {
    const saved = localStorage.getItem(SECTION_KEY) as Section | null;
    return saved && SECTIONS.includes(saved) ? saved : "zmk";
  });

  const navigate = (s: Section) => {
    setActiveSection(s);
    localStorage.setItem(SECTION_KEY, s);
  };

  // Guard against silently losing unsaved edits on reload/close (web build;
  // the desktop quit path is handled natively via the dirty registry).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAnyDirty()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Resume the native scroll engine at launch from the persisted config, so
  // it does not stay off until the user happens to open the Mouse section.
  useEffect(() => {
    if (!IS_TAURI) return;
    try {
      const raw = localStorage.getItem("uk.mouseConfig");
      if (!raw) return;
      const config = JSON.parse(raw) as { enabled?: boolean; reverse?: boolean; speed?: number };
      if (config.enabled) {
        invoke("set_mouse_config", {
          config: { enabled: true, reverse: !!config.reverse, speed: Number(config.speed) || 1 },
        }).catch(() => {});
      }
    } catch {
      /* ignore corrupt config */
    }
  }, []);

  return (
    <div className="app-layout">
      <Sidebar active={activeSection} onNavigate={navigate} />
      <main className="app-main">
        <Suspense fallback={<LoadingFallback />}>
          {/* key remounts the wrapper so each section animates in */}
          <SectionErrorBoundary section={activeSection}>
            <div key={activeSection} className="anim-fade-up" style={{ height: "100%" }}>
              {activeSection === "zmk" && <ZMKEditor />}
              {activeSection === "karabiner" && <KarabinerEditor />}
              {activeSection === "pointing" && <Pointing />}
              {activeSection === "mouse" && <Mouse />}
              {activeSection === "settings" && <Settings />}
            </div>
          </SectionErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
