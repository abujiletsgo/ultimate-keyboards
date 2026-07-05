import { useState, Suspense, lazy } from "react";
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
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-muted)",
        fontSize: "14px",
      }}
    >
      Loading...
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>("zmk");

  return (
    <div className="app-layout">
      <Sidebar active={activeSection} onNavigate={setActiveSection} />
      <main className="app-main">
        <Suspense fallback={<LoadingFallback />}>
          {activeSection === "zmk" && <ZMKEditor />}
          {activeSection === "karabiner" && <KarabinerEditor />}
          {activeSection === "training" && <Training />}
          {activeSection === "settings" && <Settings />}
        </Suspense>
      </main>
    </div>
  );
}
