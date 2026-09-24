/**
 * Pointing — trackpad/trackball tuning for each keyboard.
 * Reads the shield's right-side overlay, exposes the device's real
 * devicetree options as controls, and writes back minimal diffs.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { readText, saveText, ValidationError } from '@/lib/io'
import { registerDirtySource, syncDirty } from '@/lib/dirty'
import { POINTING_DEVICES, type PointingDevice } from '@/lib/pointingConfig'
import {
  findNode, getBoolProp, setBoolProp, getIntProp, setIntProp,
  getStringProp, setStringProp, getScaler, setScaler,
  getSnipe, setSnipe, type SnipeConfig,
  getScrollLayer, setScrollLayer, type ScrollLayerConfig,
} from '@/lib/pointingParser'

// ── Value model ───────────────────────────────────────────────────────────────

interface PointingValues {
  // listener
  speedPct: number            // zip_xy_scaler mul (div normalized to 100)
  snipe: SnipeConfig | null
  scrollLayer: ScrollLayerConfig | null
  // Azoteq
  sensitivity: string | null  // "1x".."4x"
  scroll: boolean
  naturalScrollX: boolean
  naturalScrollY: boolean
  oneFingerTap: boolean
  pressAndHold: boolean
  pressAndHoldTime: number | null
  twoFingerTap: boolean
  flipX: boolean
  flipY: boolean
  switchXY: boolean
  bottomBeta: number | null
  stationaryThreshold: number | null
  // PMW3610
  cpi: number | null
  invertX: boolean
  invertY: boolean
  smartMode: boolean
}

function parseValues(src: string, dev: PointingDevice): PointingValues {
  const sensor = findNode(src, new RegExp(dev.sensorNodeRe))
  const listener = findNode(src, new RegExp(dev.listenerNodeRe))
  const scaler = listener ? getScaler(listener) : null
  const speedPct = scaler ? Math.round((scaler.mul / scaler.div) * 100) : 100
  return {
    speedPct,
    snipe: getSnipe(src, new RegExp(dev.listenerNodeRe)),
    scrollLayer: getScrollLayer(src, new RegExp(dev.listenerNodeRe)),
    sensitivity: sensor ? getStringProp(sensor, 'sensitivity') : null,
    scroll: sensor ? getBoolProp(sensor, 'scroll') : false,
    naturalScrollX: sensor ? getBoolProp(sensor, 'natural-scroll-x') : false,
    naturalScrollY: sensor ? getBoolProp(sensor, 'natural-scroll-y') : false,
    oneFingerTap: sensor ? getBoolProp(sensor, 'one-finger-tap') : false,
    pressAndHold: sensor ? getBoolProp(sensor, 'press-and-hold') : false,
    pressAndHoldTime: sensor ? getIntProp(sensor, 'press-and-hold-time') : null,
    twoFingerTap: sensor ? getBoolProp(sensor, 'two-finger-tap') : false,
    flipX: sensor ? getBoolProp(sensor, 'flip-x') : false,
    flipY: sensor ? getBoolProp(sensor, 'flip-y') : false,
    switchXY: sensor ? getBoolProp(sensor, 'switch-xy') : false,
    bottomBeta: sensor ? getIntProp(sensor, 'bottom-beta') : null,
    stationaryThreshold: sensor ? getIntProp(sensor, 'stationary-threshold') : null,
    cpi: sensor ? getIntProp(sensor, 'res-cpi') : null,
    invertX: sensor ? getBoolProp(sensor, 'invert-x') : false,
    invertY: sensor ? getBoolProp(sensor, 'invert-y') : false,
    smartMode: sensor ? getBoolProp(sensor, 'smart-mode') : false,
  }
}

/** Apply edited values onto the ORIGINAL source with minimal diffs. */
function applyValues(src: string, dev: PointingDevice, orig: PointingValues, v: PointingValues): string {
  let s = src
  const sensorRe = new RegExp(dev.sensorNodeRe)
  const listenerRe = new RegExp(dev.listenerNodeRe)
  const sensorOp = (fn: (s: string, n: NonNullable<ReturnType<typeof findNode>>) => string) => {
    const n = findNode(s, sensorRe)
    if (n) s = fn(s, n)
  }
  const listenerOp = (fn: (s: string, n: NonNullable<ReturnType<typeof findNode>>) => string) => {
    const n = findNode(s, listenerRe)
    if (n) s = fn(s, n)
  }

  if (dev.supports.cursorScaler && v.speedPct !== orig.speedPct) {
    listenerOp((s2, n) => setScaler(s2, n, v.speedPct, 100))
  }
  if (dev.supports.chipSensitivity && v.sensitivity !== orig.sensitivity && v.sensitivity) {
    sensorOp((s2, n) => setStringProp(s2, n, 'sensitivity', v.sensitivity!))
  }
  if (dev.supports.scrollToggles) {
    if (v.scroll !== orig.scroll) sensorOp((s2, n) => setBoolProp(s2, n, 'scroll', v.scroll))
    if (v.naturalScrollX !== orig.naturalScrollX) sensorOp((s2, n) => setBoolProp(s2, n, 'natural-scroll-x', v.naturalScrollX))
    if (v.naturalScrollY !== orig.naturalScrollY) sensorOp((s2, n) => setBoolProp(s2, n, 'natural-scroll-y', v.naturalScrollY))
  }
  if (dev.supports.gestures) {
    if (v.oneFingerTap !== orig.oneFingerTap) sensorOp((s2, n) => setBoolProp(s2, n, 'one-finger-tap', v.oneFingerTap))
    if (v.pressAndHold !== orig.pressAndHold) sensorOp((s2, n) => setBoolProp(s2, n, 'press-and-hold', v.pressAndHold))
    if (v.twoFingerTap !== orig.twoFingerTap) sensorOp((s2, n) => setBoolProp(s2, n, 'two-finger-tap', v.twoFingerTap))
    if (v.pressAndHoldTime !== orig.pressAndHoldTime && v.pressAndHoldTime != null)
      sensorOp((s2, n) => setIntProp(s2, n, 'press-and-hold-time', v.pressAndHoldTime!))
  }
  if (dev.supports.advancedAzoteq) {
    if (v.flipX !== orig.flipX) sensorOp((s2, n) => setBoolProp(s2, n, 'flip-x', v.flipX))
    if (v.flipY !== orig.flipY) sensorOp((s2, n) => setBoolProp(s2, n, 'flip-y', v.flipY))
    if (v.switchXY !== orig.switchXY) sensorOp((s2, n) => setBoolProp(s2, n, 'switch-xy', v.switchXY))
    if (v.bottomBeta !== orig.bottomBeta && v.bottomBeta != null)
      sensorOp((s2, n) => setIntProp(s2, n, 'bottom-beta', v.bottomBeta!))
    if (v.stationaryThreshold !== orig.stationaryThreshold && v.stationaryThreshold != null)
      sensorOp((s2, n) => setIntProp(s2, n, 'stationary-threshold', v.stationaryThreshold!))
  }
  if (dev.supports.cpi && v.cpi !== orig.cpi && v.cpi != null) {
    sensorOp((s2, n) => setIntProp(s2, n, 'res-cpi', v.cpi!))
  }
  if (dev.supports.invertXY) {
    if (v.invertX !== orig.invertX) sensorOp((s2, n) => setBoolProp(s2, n, 'invert-x', v.invertX))
    if (v.invertY !== orig.invertY) sensorOp((s2, n) => setBoolProp(s2, n, 'invert-y', v.invertY))
  }
  if (dev.supports.smartMode && v.smartMode !== orig.smartMode) {
    sensorOp((s2, n) => setBoolProp(s2, n, 'smart-mode', v.smartMode))
  }
  if (dev.supports.snipe && JSON.stringify(v.snipe) !== JSON.stringify(orig.snipe)) {
    s = setSnipe(s, listenerRe, v.snipe)
  }
  if (dev.supports.scrollLayer && JSON.stringify(v.scrollLayer) !== JSON.stringify(orig.scrollLayer)) {
    s = setScrollLayer(s, listenerRe, v.scrollLayer)
  }
  return s
}

// ── Small controls ────────────────────────────────────────────────────────────

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
      <span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>{hint}</span>}
      </span>
      <span
        onClick={e => { e.preventDefault(); onChange(!value) }}
        style={{
          width: 40, height: 22, borderRadius: 11, flexShrink: 0, position: 'relative',
          background: value ? 'var(--accent-grad)' : 'rgba(255,255,255,0.10)',
          boxShadow: value ? 'var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.2)' : 'inset 0 1px 3px rgba(0,0,0,0.4)',
          transition: 'background var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out)',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 20 : 2,
          width: 18, height: 18, borderRadius: 9, background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          transition: 'left var(--dur-2) var(--ease-spring)',
        }} />
      </span>
    </label>
  )
}

function SliderRow({ label, hint, value, min, max, step, unit, onChange }: {
  label: string; hint?: string; value: number; min: number; max: number; step: number; unit: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <span style={{ minWidth: 64, textAlign: 'right', color: 'var(--accent)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
          {value}{unit}
        </span>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass anim-fade-up" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function Pointing() {
  const [devId, setDevId] = useState<string>(POINTING_DEVICES[0].keyboardId)
  const dev = useMemo(() => POINTING_DEVICES.find(d => d.keyboardId === devId)!, [devId])

  const [source, setSource] = useState<string | null>(null)
  const [orig, setOrig] = useState<PointingValues | null>(null)
  const [values, setValues] = useState<PointingValues | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  /** Device the user tried to switch to while having unsaved changes */
  const [pendingSwitch, setPendingSwitch] = useState<PointingDevice | null>(null)

  const dirty = !!(orig && values && JSON.stringify(orig) !== JSON.stringify(values))
  // Report unsaved edits app-wide (quit guard).
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  useEffect(() => registerDirtySource('pointing', () => dirtyRef.current), [])
  useEffect(() => { syncDirty() }, [dirty])

  // Guard reload/close while dirty (matches the keymap editor's behavior)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const switchDevice = (d: PointingDevice, force = false) => {
    if (d.keyboardId === devId) return
    if (dirty && !force) {
      setPendingSwitch(d)
      return
    }
    setPendingSwitch(null)
    setDevId(d.keyboardId)
  }

  const load = (d: PointingDevice) => {
    setSource(null); setOrig(null); setValues(null); setLoadError(null)
    readText(d.overlayPath)
      .then(text => {
        setSource(text)
        const v = parseValues(text, d)
        setOrig(v)
        setValues(v)
      })
      .catch(err => setLoadError(String(err)))
  }

  useEffect(() => { load(dev) }, [dev])

  const save = async () => {
    if (!source || !orig || !values) return
    try {
      const updated = applyValues(source, dev, orig, values)
      await saveText(dev.overlayPath, updated, {
        validate: (out) => {
          try { parseValues(out, dev) } catch (e) { return `output does not parse: ${e}` }
          return null
        },
      })
      setSource(updated)
      const v = parseValues(updated, dev)
      setOrig(v)
      setValues(v)
      setStatus({ msg: 'Saved! Rebuild + flash firmware to apply.', ok: true })
      setTimeout(() => setStatus(null), 3500)
    } catch (err) {
      const msg = err instanceof ValidationError ? `Not saved — ${err.message}` : `Error saving: ${err}`
      setStatus({ msg, ok: false })
    }
  }

  const set = <K extends keyof PointingValues>(k: K, v: PointingValues[K]) =>
    setValues(prev => (prev ? { ...prev, [k]: v } : prev))

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div className="section-header">
        <span className="section-title">Pointing Devices</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {status && (
            <span style={{ fontSize: 12, color: status.ok ? 'var(--success)' : 'var(--danger)' }}>{status.msg}</span>
          )}
          {dirty && <span className="tag" style={{ background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.25)', color: 'var(--warning)' }}>Unsaved</span>}
          <button className="btn btn-primary" onClick={save} disabled={!dirty}>Save</button>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Device switcher */}
        <div className="seg-ctrl" style={{ alignSelf: 'flex-start' }}>
          {POINTING_DEVICES.map(d => (
            <button
              key={d.keyboardId}
              className={`seg-btn${devId === d.keyboardId ? ' active' : ''}`}
              onClick={() => switchDevice(d)}
              title={d.overlayPath}
            >
              {d.keyboardName} <span style={{ opacity: 0.65, fontWeight: 400, marginLeft: 4 }}>· {d.deviceName.toLowerCase()}</span>
            </button>
          ))}
        </div>

        {/* Unsaved-changes guard when switching devices */}
        {pendingSwitch && (
          <div className="glass anim-fade-up" style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 14px', fontSize: 12,
            borderColor: 'rgba(251,191,36,0.35)',
          }}>
            <span>
              Unsaved changes on <strong>{dev.keyboardName}</strong> — switch to{' '}
              <strong>{pendingSwitch.keyboardName}</strong> and discard them?
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => switchDevice(pendingSwitch, true)}>
              Discard &amp; switch
            </button>
            <button className="btn btn-secondary btn-sm" onClick={async () => { await save(); switchDevice(pendingSwitch, true) }}>
              Save, then switch
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPendingSwitch(null)}>Cancel</button>
          </div>
        )}

        {loadError ? (
          <div className="panel-inset" style={{ padding: '12px 16px', color: 'var(--danger)', fontSize: 12, wordBreak: 'break-all' }}>
            Could not load {dev.overlayPath}: {loadError}
          </div>
        ) : !values ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -8 }}>
              {dev.chip} — editing <span className="mono">{dev.overlayPath.split('/').slice(-1)[0]}</span>.
              Changes take effect after you commit, rebuild, and flash the firmware.
            </div>

            {/* Cursor */}
            <Group title="Cursor">
              {dev.supports.cursorScaler && (
                <SliderRow
                  label="Cursor speed"
                  hint="zip_xy_scaler — % of raw sensor motion"
                  value={values.speedPct} min={10} max={200} step={5} unit="%"
                  onChange={v => set('speedPct', v)}
                />
              )}
              {dev.supports.chipSensitivity && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Chip sensitivity</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Hardware gain applied by the touch controller</span>
                  </span>
                  <div className="seg-ctrl">
                    {['1x', '2x', '3x', '4x'].map(s => (
                      <button key={s} className={`seg-btn${values.sensitivity === s ? ' active' : ''}`} onClick={() => set('sensitivity', s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {dev.supports.cpi && values.cpi != null && (
                <SliderRow
                  label="Sensor CPI"
                  hint="res-cpi — counts per inch (physical resolution)"
                  value={values.cpi} min={400} max={3200} step={100} unit=" cpi"
                  onChange={v => set('cpi', v)}
                />
              )}
              {dev.supports.invertXY && (
                <>
                  <Toggle label="Invert X" hint="Flip horizontal cursor direction (invert-x)" value={values.invertX} onChange={v => set('invertX', v)} />
                  <Toggle label="Invert Y" hint="Flip vertical cursor direction (invert-y)" value={values.invertY} onChange={v => set('invertY', v)} />
                </>
              )}
              {dev.supports.advancedAzoteq && (
                <>
                  <Toggle label="Flip X" hint="Mirror horizontal axis for mounting orientation (flip-x)" value={values.flipX} onChange={v => set('flipX', v)} />
                  <Toggle label="Flip Y" hint="Mirror vertical axis (flip-y)" value={values.flipY} onChange={v => set('flipY', v)} />
                  <Toggle label="Swap X/Y" hint="Rotate 90° by swapping axes (switch-xy)" value={values.switchXY} onChange={v => set('switchXY', v)} />
                </>
              )}
              {dev.supports.smartMode && (
                <Toggle label="Smart mode" hint="Sensor's self-adjusting surface tuning (smart-mode)" value={values.smartMode} onChange={v => set('smartMode', v)} />
              )}
            </Group>

            {/* Scrolling (Azoteq) */}
            {dev.supports.scrollToggles && (
              <Group title="Scrolling">
                <Toggle label="Two-finger scroll" hint="Enable scroll gesture (scroll)" value={values.scroll} onChange={v => set('scroll', v)} />
                <Toggle label="Natural scroll — vertical" hint="Reverse Y scroll direction (natural-scroll-y)" value={values.naturalScrollY} onChange={v => set('naturalScrollY', v)} />
                <Toggle label="Natural scroll — horizontal" hint="Reverse X scroll direction (natural-scroll-x)" value={values.naturalScrollX} onChange={v => set('naturalScrollX', v)} />
              </Group>
            )}

            {/* Gestures (Azoteq) */}
            {dev.supports.gestures && (
              <Group title="Tap & Gestures">
                <Toggle label="One-finger tap" hint="Tap to left-click (one-finger-tap)" value={values.oneFingerTap} onChange={v => set('oneFingerTap', v)} />
                <Toggle label="Two-finger tap" hint="Two-finger tap to right-click (two-finger-tap)" value={values.twoFingerTap} onChange={v => set('twoFingerTap', v)} />
                <Toggle label="Press & hold" hint="Hold to drag (press-and-hold)" value={values.pressAndHold} onChange={v => set('pressAndHold', v)} />
                {values.pressAndHold && values.pressAndHoldTime != null && (
                  <SliderRow
                    label="Press & hold time"
                    hint="press-and-hold-time"
                    value={values.pressAndHoldTime} min={100} max={600} step={25} unit=" ms"
                    onChange={v => set('pressAndHoldTime', v)}
                  />
                )}
              </Group>
            )}

            {/* Scroll layer (trackball) */}
            {dev.supports.scrollLayer && (
              <Group title="Scroll mode">
                <Toggle
                  label="Scroll on layer"
                  hint="Ball motion becomes scrolling while a chosen layer is held"
                  value={values.scrollLayer !== null}
                  onChange={on => set('scrollLayer', on ? { layer: 5, divisor: 4 } : null)}
                />
                {values.scrollLayer && (
                  <>
                    <SliderRow
                      label="Scroll layer"
                      hint="Layer number that turns motion into scrolling"
                      value={values.scrollLayer.layer} min={0} max={15} step={1} unit=""
                      onChange={v => set('scrollLayer', { ...values.scrollLayer!, layer: v })}
                    />
                    <SliderRow
                      label="Scroll speed divisor"
                      hint="Higher = slower, more controlled scrolling"
                      value={values.scrollLayer.divisor} min={1} max={16} step={1} unit="÷"
                      onChange={v => set('scrollLayer', { ...values.scrollLayer!, divisor: v })}
                    />
                    <div className="panel-inset" style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Bind a key to <span className="mono">&mo {values.scrollLayer.layer}</span> in the keymap —
                      holding it scrolls instead of moving the cursor.
                    </div>
                  </>
                )}
              </Group>
            )}

            {/* Snipe */}
            {dev.supports.snipe && (
              <Group title="Sniping (precision mode)">
                <Toggle
                  label="Snipe mode"
                  hint="Slows the cursor while a chosen layer is held"
                  value={values.snipe !== null}
                  onChange={on => set('snipe', on ? { layer: 8, divisor: 3 } : null)}
                />
                {values.snipe && (
                  <>
                    <SliderRow
                      label="Slowdown factor"
                      hint={`cursor runs at 1/${values.snipe.divisor} speed`}
                      value={values.snipe.divisor} min={2} max={10} step={1} unit="×"
                      onChange={v => set('snipe', { ...values.snipe!, divisor: v })}
                    />
                    <SliderRow
                      label="Snipe layer"
                      hint="Layer number that activates sniping"
                      value={values.snipe.layer} min={0} max={15} step={1} unit=""
                      onChange={v => set('snipe', { ...values.snipe!, layer: v })}
                    />
                    <div className="panel-inset" style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <strong style={{ color: 'var(--text)' }}>Activation key:</strong> in the ZMK editor, create a layer
                      (e.g. “Snipe”, note its number), set it above, then bind a key to{' '}
                      <span className="mono">&mo {values.snipe.layer}</span> — holding that key snipes.
                    </div>
                  </>
                )}
              </Group>
            )}

            {/* Advanced (Azoteq) */}
            {dev.supports.advancedAzoteq && values.bottomBeta != null && values.stationaryThreshold != null && (
              <Group title="Advanced filtering">
                <SliderRow
                  label="Bottom beta"
                  hint="bottom-beta — low-speed smoothing filter"
                  value={values.bottomBeta} min={0} max={15} step={1} unit=""
                  onChange={v => set('bottomBeta', v)}
                />
                <SliderRow
                  label="Stationary threshold"
                  hint="stationary-threshold — movement dead-zone"
                  value={values.stationaryThreshold} min={0} max={20} step={1} unit=""
                  onChange={v => set('stationaryThreshold', v)}
                />
              </Group>
            )}
          </>
        )}
      </div>
    </div>
  )
}
