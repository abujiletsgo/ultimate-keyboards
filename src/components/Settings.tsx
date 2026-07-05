import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface SettingsState {
  chordWindowMs: number;
  theme: "dark";
  autoSave: boolean;
  zmkRepoPath: string;
  karabinerConfigPath: string;
}

const DEFAULT_SETTINGS: SettingsState = {
  chordWindowMs: 80,
  theme: "dark",
  autoSave: true,
  zmkRepoPath: "",
  karabinerConfigPath:
    "~/.config/karabiner/assets/complex_modifications/ultimate-keyboards.json",
};

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  function handleChange<K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K]
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    // Persist to localStorage as a simple config store
    localStorage.setItem("ultimate-keyboards-settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      {/* Header */}
      <div className="section-header">
        <span className="section-title">Settings</span>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          style={saved ? { backgroundColor: "var(--success)" } : undefined}
        >
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "24px", maxWidth: "600px" }}>
        {/* Training Section */}
        <Section title="Training">
          <Field label="Chord Window (ms)" hint="Time window for chord detection (20–150ms)">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="range"
                min={20}
                max={150}
                value={settings.chordWindowMs}
                onChange={(e) =>
                  handleChange("chordWindowMs", Number(e.target.value))
                }
                style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <span
                style={{
                  minWidth: "40px",
                  textAlign: "right",
                  color: "var(--accent)",
                  fontWeight: 600,
                  fontSize: "13px",
                }}
              >
                {settings.chordWindowMs}ms
              </span>
            </div>
          </Field>
        </Section>

        {/* File Paths Section */}
        <Section title="File Paths">
          <Field
            label="ZMK Repo Path"
            hint="Local path to your ZMK config repository"
          >
            <input
              type="text"
              value={settings.zmkRepoPath}
              onChange={(e) => handleChange("zmkRepoPath", e.target.value)}
              placeholder="~/zmk-config"
              style={{ width: "100%" }}
            />
          </Field>

          <Field
            label="Karabiner Config Path"
            hint="Output path for Karabiner complex modifications JSON"
          >
            <input
              type="text"
              value={settings.karabinerConfigPath}
              onChange={(e) => handleChange("karabinerConfigPath", e.target.value)}
              style={{ width: "100%" }}
            />
          </Field>
        </Section>

        {/* MacBook Keyboard Section */}
        <Section title="MacBook Keyboard">
          <BuiltInKeyboardField />
        </Section>

        {/* General Section */}
        <Section title="General">
          <Field label="Auto Save" hint="Automatically save changes when switching sections">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={settings.autoSave}
                onChange={(e) => handleChange("autoSave", e.target.checked)}
                style={{ accentColor: "var(--accent)", width: "16px", height: "16px" }}
              />
              <span style={{ fontSize: "13px" }}>
                {settings.autoSave ? "Enabled" : "Disabled"}
              </span>
            </label>
          </Field>

          <Field label="Theme" hint="App color theme">
            <select
              value={settings.theme}
              onChange={(e) => handleChange("theme", e.target.value as "dark")}
              style={{ width: "140px" }}
            >
              <option value="dark">Dark</option>
            </select>
          </Field>
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
            <p>ZMK / QMK keymap editor, Karabiner-Elements configurator, and chord typing trainer.</p>
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
      <h2
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "12px",
        }}
      >
        {title}
      </h2>
      <div
        className="panel"
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
          gap: "8px",
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={disabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          style={{ accentColor: "var(--accent)", width: "16px", height: "16px" }}
        />
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
        <div style={{ fontSize: "11px", color: "var(--danger, #e5484d)", marginTop: "6px" }}>
          {error}
        </div>
      )}
    </Field>
  );
}
