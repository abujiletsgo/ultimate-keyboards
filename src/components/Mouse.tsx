/**
 * This Mac › Scroll & Mouse — the native scroll engine (Rust CGEventTap).
 * Changes discrete scroll-wheel events only (mice, the keyboard's scroll
 * layer); the MacBook trackpad's gestures pass through untouched.
 *
 * Every change is applied to the engine first and only shown as "on" once
 * the engine accepted it, so a refusal can never look like a dead switch.
 */
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from '@/lib/io'
import { Switch } from '@/components/ui'

const STORE_KEY = 'uk.mouseConfig'

interface MouseConfig { enabled: boolean; reverse: boolean; speed: number }
const DEFAULTS: MouseConfig = { enabled: false, reverse: false, speed: 1.0 }

function loadSaved(): MouseConfig {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return { ...DEFAULTS, ...JSON.parse(raw) } } catch { /* ignore */ }
  return DEFAULTS
}
function save(c: MouseConfig) { try { localStorage.setItem(STORE_KEY, JSON.stringify(c)) } catch { /* ignore */ } }

export default function Mouse() {
  const [config, setConfig] = useState<MouseConfig>({ ...loadSaved(), enabled: false })
  const [busy, setBusy] = useState(false)
  const [needsPermission, setNeedsPermission] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wanted = useRef<MouseConfig | null>(null)

  const apply = async (next: MouseConfig) => {
    if (!IS_TAURI) return
    setBusy(true); setError(null)
    try {
      await invoke('set_mouse_config', { config: next })
      setConfig(next); save(next); setNeedsPermission(false); wanted.current = null
    } catch (e) {
      const trusted = await invoke<boolean>('accessibility_trusted').catch(() => true)
      if (!trusted) { setNeedsPermission(true); wanted.current = next }
      else setError(String(e))
    } finally { setBusy(false) }
  }

  // Resume the saved state on open (the engine does not run until asked).
  useEffect(() => { const s = loadSaved(); if (s.enabled) apply(s) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // While waiting for the user to grant Accessibility, retry as soon as it is granted.
  useEffect(() => {
    if (!needsPermission) return
    const t = setInterval(async () => {
      if (await invoke<boolean>('accessibility_trusted').catch(() => false)) {
        clearInterval(t)
        if (wanted.current) apply(wanted.current)
      }
    }, 1500)
    return () => clearInterval(t)
  }, [needsPermission]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<MouseConfig>) => apply({ ...config, ...p })
  const on = config.enabled

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div className="section-header">
        <span className="section-title">Scroll &amp; Mouse</span>
      </div>

      <div style={{ padding: 24, maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!IS_TAURI && (
          <div className="panel-inset" style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 14px' }}>
            The scroll engine runs in the desktop app only.
          </div>
        )}

        <div className="glass" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Switch
            checked={on}
            busy={busy}
            disabled={!IS_TAURI}
            onChange={v => patch({ enabled: v })}
            label="Scroll engine"
            description={on ? 'On. Mouse wheels and your keyboard’s scroll layer use the settings below.' : 'Off. Turn on to change scroll direction and speed for mice and your keyboard’s scroll layer. The MacBook trackpad is never changed.'}
          />

          {needsPermission && (
            <div className="panel-inset" role="alert" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, borderColor: 'rgba(251,191,36,0.35)' }}>
              <strong style={{ fontSize: 13 }}>Allow Accessibility access</strong>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                macOS only lets an app change scrolling after you allow it. Click the button, switch on <strong>Ultimate Keyboards</strong> in the list, and come back. The engine turns on by itself.
              </span>
              <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => invoke('open_accessibility_settings').catch(e => setError(String(e)))}>
                Open Accessibility settings
              </button>
            </div>
          )}
          {error && <div className="panel-inset" role="alert" style={{ padding: '10px 14px', fontSize: 12, color: 'var(--danger)' }}>{error}</div>}

          <div style={{ opacity: on ? 1 : 0.45, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Switch
              checked={config.reverse}
              disabled={!on || busy}
              onChange={v => patch({ reverse: v })}
              label="Reverse direction"
              description={config.reverse ? 'Wheel down scrolls up.' : 'Wheel down scrolls down.'}
            />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Speed</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>{config.speed.toFixed(2)}×</span>
              </div>
              <input
                type="range" min={0.25} max={4} step={0.25} value={config.speed}
                disabled={!on || busy}
                onChange={e => setConfig(c => ({ ...c, speed: Number(e.target.value) }))}
                onPointerUp={() => patch({})}
                onKeyUp={() => patch({})}
                aria-label="Scroll speed"
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
