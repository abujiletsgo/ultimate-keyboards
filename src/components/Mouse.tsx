import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const STORE_KEY = "uk.mouseConfig";

interface MouseConfig {
  enabled: boolean;
  reverse: boolean;
  speed: number;
}

const DEFAULTS: MouseConfig = { enabled: false, reverse: false, speed: 1.0 };

function loadConfig(): MouseConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

/// Our own native scroll engine (Rust CGEventTap in src-tauri) — not a fork.
/// Only discrete scroll-wheel events are touched; the MacBook trackpad's
/// continuous gestures pass through untouched.
export default function Mouse() {
  const [config, setConfig] = useState<MouseConfig>(loadConfig);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Push config to the engine on mount (so it resumes after an app restart)
  // and whenever it changes.
  useEffect(() => {
    if (!IS_TAURI) return;
    let cancelled = false;
    setBusy(true);
    invoke("set_mouse_config", { config })
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          // Reflect reality: if the engine refused (e.g. no Accessibility
          // grant), don't leave the UI claiming it's on.
          if (config.enabled) setConfig((c) => ({ ...c, enabled: false }));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(config));
    } catch {
      /* ignore */
    }
    return () => {
      cancelled = true;
    };
  }, [config]);

  const patch = (p: Partial<MouseConfig>) => setConfig((c) => ({ ...c, ...p }));

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div className="section-header">
        <span className="section-title">Mouse</span>
      </div>

      <div style={{ padding: "24px", maxWidth: "640px", margin: "0 auto" }}>
        {!IS_TAURI && (
          <div
            className="panel-inset"
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              padding: "10px 14px",
              marginBottom: "20px",
            }}
          >
            The mouse engine runs in the desktop app only — it needs a native
            event tap. Open Ultimate Keyboards as the packaged app to use it.
          </div>
        )}

        <Section title="Scroll">
          <ToggleField
            label="Enable scroll engine"
            hint={config.enabled ? "Active" : "Off"}
            checked={config.enabled}
            busy={busy}
            onChange={(v) => patch({ enabled: v })}
            caption={
              config.enabled
                ? "Intercepting scroll-wheel input. Trackpad gestures are left untouched."
                : "Turn on to reverse direction and adjust scroll speed for mice / the split-keyboard scroll layer."
            }
          />

          <ToggleField
            label="Reverse direction"
            hint={config.reverse ? "Reversed" : "Natural"}
            checked={config.reverse}
            busy={busy || !config.enabled}
            onChange={(v) => patch({ reverse: v })}
            caption="Flip vertical scroll direction for discrete wheels."
          />

          <div style={{ opacity: config.enabled ? 1 : 0.5 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>
                Scroll speed
              </label>
              <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {config.speed.toFixed(2)}×
              </span>
            </div>
            <input
              type="range"
              min={0.25}
              max={5}
              step={0.05}
              value={config.speed}
              disabled={!config.enabled}
              onChange={(e) => patch({ speed: parseFloat(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--accent)", cursor: config.enabled ? "pointer" : "default" }}
            />
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
              Multiplies each scroll tick. 1.00× is unchanged.
            </div>
          </div>
        </Section>

        {error && (
          <div
            className="panel-inset"
            style={{
              fontSize: "12px",
              color: "var(--danger)",
              background: "rgba(251,113,133,0.08)",
              padding: "10px 14px",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px", lineHeight: 1.7 }}>
          Native scroll engine — built into Ultimate Keyboards, no external app.
          More (smooth scrolling, button remaps, gestures) coming as the engine grows.
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <h2 className="section-title" style={{ marginBottom: "12px" }}>
        {title}
      </h2>
      <div
        className="glass anim-fade-up"
        style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}
      >
        {children}
      </div>
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  busy,
  onChange,
  caption,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  busy?: boolean;
  onChange: (v: boolean) => void;
  caption?: string;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "6px",
        }}
      >
        <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>{label}</label>
        {hint && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{hint}</span>}
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <span style={{ position: "relative", width: "40px", height: "22px", flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={checked}
            disabled={busy}
            onChange={(e) => onChange(e.target.checked)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, opacity: 0, cursor: "inherit" }}
          />
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 9999,
              background: checked ? "var(--accent-grad)" : "var(--glass-bg)",
              border: `1px solid ${checked ? "transparent" : "var(--glass-border)"}`,
              boxShadow: checked ? "var(--accent-glow)" : "none",
              transition: "background var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out)",
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              position: "absolute",
              top: "2px",
              left: checked ? "20px" : "2px",
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(3,4,12,0.45)",
              transition: "left var(--dur-2) var(--ease-spring)",
              pointerEvents: "none",
            }}
          />
        </span>
        {caption && <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{caption}</span>}
      </label>
    </div>
  );
}
