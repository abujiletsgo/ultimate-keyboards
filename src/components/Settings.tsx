import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ZMK_KEYBOARDS } from "@/lib/keyboards";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export default function Settings() {
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      {/* Header */}
      <div className="section-header">
        <span className="section-title">Settings</span>
      </div>

      {/* Content */}
      <div style={{ padding: "24px", maxWidth: "640px", margin: "0 auto" }}>
        {/* Keyboards Section */}
        <Section title="Keyboards">
          {ZMK_KEYBOARDS.map((kb) => (
            <Field key={kb.id} label={`${kb.name} · ${kb.variant}`}>
              <span className="mono" style={{ display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={kb.keymapPath}>
                {kb.keymapPath}
              </span>
            </Field>
          ))}
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Keymap files are read from and saved to these local git checkouts.
            Switch boards from the ZMK editor toolbar.
          </div>
        </Section>

        {/* MacBook Keyboard Section */}
        <Section title="MacBook Keyboard">
          <BuiltInKeyboardField />
        </Section>

        {/* About Section */}
        <Section title="About">
          <div
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              lineHeight: "1.8",
            }}
          >
            <p>
              <strong style={{ color: "var(--text)" }}>Ultimate Keyboards</strong> v0.1.0
            </p>
            <p>ZMK / QMK keymap editor, pointing-device tuner, and Karabiner-Elements configurator.</p>
            <p style={{ marginTop: "8px" }}>
              Built with Tauri v2 + React 19 + TypeScript.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

// Sub-components

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <h2 className="section-title" style={{ marginBottom: "12px" }}>
        {title}
      </h2>
      <div
        className="glass anim-fade-up"
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
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
        <label
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text)",
          }}
        >
          {label}
        </label>
        {hint && (
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{hint}</span>
        )}
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
      .then((un) => {
        unlisten = un;
      })
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
    <Field
      label="Disable built-in keyboard"
      hint={disabled ? "Built-in keyboard OFF" : "Built-in keyboard on"}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <span style={{ position: "relative", width: "40px", height: "22px", flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={disabled}
            disabled={busy}
            onChange={(e) => toggle(e.target.checked)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, opacity: 0, cursor: "inherit" }}
          />
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 9999,
              background: disabled ? "var(--accent-grad)" : "var(--glass-bg)",
              border: `1px solid ${disabled ? "transparent" : "var(--glass-border)"}`,
              boxShadow: disabled ? "var(--accent-glow)" : "none",
              transition: "background var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out)",
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              position: "absolute",
              top: "2px",
              left: disabled ? "20px" : "2px",
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
        <span style={{ fontSize: "13px" }}>
          {disabled
            ? "MacBook keyboard is disabled"
            : "Turn off when your split keyboard is resting on the laptop"}
        </span>
      </label>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
        Also available from the menu-bar icon. Automatically re-enabled when you
        quit the app.
      </div>
      {error && (
        <div
          className="panel-inset"
          style={{ fontSize: "11px", color: "var(--danger)", background: "rgba(251,113,133,0.08)", padding: "6px 10px", marginTop: "6px" }}
        >
          {error}
        </div>
      )}
    </Field>
  );
}
