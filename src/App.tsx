import { useState, Suspense, lazy, Component, type ReactNode } from "react";
import Sidebar from "@/components/Sidebar";

const ZMKEditor = lazy(() => import("@/components/ZMKEditor"));
const KarabinerEditor = lazy(() => import("@/components/KarabinerEditor"));
const Training = lazy(() => import("@/components/Training"));
const Settings = lazy(() => import("@/components/Settings"));

export type Section = "zmk" | "karabiner" | "training" | "settings";

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

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>("zmk");

  return (
    <div className="app-layout">
      <Sidebar active={activeSection} onNavigate={setActiveSection} />
      <main className="app-main">
        <Suspense fallback={<LoadingFallback />}>
          {/* key remounts the wrapper so each section animates in */}
          <SectionErrorBoundary section={activeSection}>
            <div key={activeSection} className="anim-fade-up" style={{ height: "100%" }}>
              {activeSection === "zmk" && <ZMKEditor />}
              {activeSection === "karabiner" && <KarabinerEditor />}
              {activeSection === "training" && <Training />}
              {activeSection === "settings" && <Settings />}
            </div>
          </SectionErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
