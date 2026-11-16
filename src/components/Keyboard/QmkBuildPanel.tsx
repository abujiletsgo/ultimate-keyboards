/**
 * Build tab for a QMK keyboard. The app does not compile QMK, so this says
 * exactly how the keymap on screen reaches the keyboard (lib/qmkBuild):
 *   - VIA / Vial keyboard linked from Plugged in: Write to keyboard
 *     (experimental; backup, only the changed keys, each read back),
 *   - keymap.json: the QMK CLI commands, or QMK Configurator,
 *   - a .uf2 built elsewhere: copied to a UF2 bootloader drive.
 */
import { useCallback, useEffect, useState } from 'react'
import { tail } from '@/lib/paths'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Copy, Upload, Zap } from 'lucide-react'
import { ErrorPanel, useToast } from '@/components/ui'
import { IS_TAURI, readText } from '@/lib/io'
import { isAnyDirty, saveAllDirty } from '@/lib/dirty'
import { qmkKeymapFacts } from '@/lib/registry/detect'
import { qmkBuildRoute, type QmkBuildRoute } from '@/lib/qmkBuild'
import { listUsbKeyboards, openHid, qmkKeycode, via } from '@/lib/device'
import { saveDeviceBackup } from '@/lib/device/backup'
import {
  keymapJsonLayers, previewKeymapWrite, writeKeymapToDevice, WriteFailed,
  type DeviceLink, type WritePlan, type WriteReport,
} from '@/lib/device/writeBack'
import type { KeyboardDef } from '@/lib/registry/types'

const sectionLabel = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' } as const

export default function QmkBuildPanel({ keyboard }: { keyboard: KeyboardDef }) {
  const [route, setRoute] = useState<QmkBuildRoute | null>(null)
  useEffect(() => {
    let alive = true
    readText(keyboard.keymapPath)
      .then(t => { if (alive) setRoute(qmkBuildRoute(qmkKeymapFacts(t, keyboard.keymapPath), keyboard.keymapPath)) })
      .catch(e => { if (alive) setRoute({ kind: 'unreadable', reason: `Could not read ${keyboard.keymapPath}: ${e instanceof Error ? e.message : e}` }) })
    return () => { alive = false }
  }, [keyboard.keymapPath])

  if (!IS_TAURI) return <div className="panel-inset" style={{ padding: 14, fontSize: 12, color: 'var(--text-secondary)' }}>Building and flashing need the desktop app.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Build</h3>
      {keyboard.device && <WriteToKeyboard keyboard={keyboard} link={keyboard.device} />}
      {!route ? <div className="skeleton" style={{ height: 80 }} /> : <Route route={route} linked={!!keyboard.device} />}
      <FlashUf2 />
    </div>
  )
}

// ── how this keymap reaches the keyboard ────────────────────────────────────

function Command({ text }: { text: string }) {
  const toast = useToast()
  return (
    <div className="panel-inset" style={{ padding: '6px 6px 6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <code className="mono" style={{ flex: 1, fontSize: 12, overflowX: 'auto', whiteSpace: 'nowrap' }}>{text}</code>
      <button className="btn btn-ghost btn-sm btn-icon" aria-label={`Copy: ${text}`} title="Copy"
        onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Copied'), e => toast.error(String(e)))}>
        <Copy size={12} />
      </button>
    </div>
  )
}

function Route({ route, linked }: { route: QmkBuildRoute; linked: boolean }) {
  const text = { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 } as const
  if (route.kind === 'unreadable') return <ErrorPanel>{route.reason}</ErrorPanel>
  if (route.kind === 'via-export') {
    if (linked) return null
    return (
      <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={sectionLabel}>VIA / Vial keymap</div>
        <p style={text}>
          VIA and Vial keyboards take key changes live, with no firmware build. To write your edits from this app, plug the keyboard in,
          open <strong>Add keyboard › Plugged in</strong>, read it and save it as a keymap file: that links the keyboard.
          Or load this file in VIA (<span className="mono">usevia.app</span> › Save + Load › Load).
        </p>
      </section>
    )
  }
  if (route.kind === 'keymap-json-no-keyboard') {
    return (
      <section className="glass" style={{ padding: 14 }}>
        <p style={text}>This keymap.json does not say which keyboard it is for. Add a <span className="mono">"keyboard"</span> entry (e.g. <span className="mono">"planck/rev6"</span>) so QMK can build it.</p>
      </section>
    )
  }
  return (
    <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={sectionLabel}>Compile and flash with QMK</div>
      <p style={text}>
        This app edits the keymap; QMK builds the firmware for <span className="mono">{route.keyboard}</span>. With the QMK CLI set up
        (<span className="mono">qmk setup</span>), save your edits, then run:
      </p>
      <Command text={route.compile} />
      <Command text={route.flash} />
      <p style={text}>
        <span className="mono">qmk flash</span> compiles too, then waits for the keyboard’s bootloader. Without the CLI, use QMK Configurator
        (<span className="mono">config.qmk.fm</span>): upload this keymap.json, compile, download the firmware and flash it with QMK Toolbox.
      </p>
    </section>
  )
}

function FlashUf2() {
  const toast = useToast()
  const [waiting, setWaiting] = useState<string | null>(null)
  const pick = async () => {
    const file = await open({ multiple: false, filters: [{ name: 'UF2 firmware', extensions: ['uf2'] }], title: 'Choose a .uf2 firmware file' })
    if (!file || Array.isArray(file)) return
    setWaiting(file)
    try { toast.success(`Flashed: ${await invoke<string>('flash_uf2', { path: file, timeoutSecs: 120 })}`) }
    catch (e) { toast.error(String(e)) }
    finally { setWaiting(null) }
  }
  return (
    <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={sectionLabel}>Flash a .uf2 file</div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
        For keyboards with a UF2 bootloader, such as RP2040 boards. Choose the file, then put the keyboard in bootloader mode
        (double-tap reset, or hold the boot key while plugging it in). Other controllers flash with <span className="mono">qmk flash</span> or QMK Toolbox.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-secondary btn-sm" onClick={pick} disabled={!!waiting}><Zap size={12} /> {waiting ? 'Waiting for bootloader…' : 'Choose .uf2 and flash'}</button>
        {waiting && <span role="status" style={{ fontSize: 12, color: 'var(--warning)' }}>Put the keyboard in bootloader mode now. Waiting up to 2 minutes.</span>}
      </div>
    </section>
  )
}

// ── VIA / Vial: write the keymap on screen to the keyboard (experimental) ───

type WriteState =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'preview'; plan: WritePlan; layers: string[][] }
  | { step: 'writing'; done: number; total: number }
  | { step: 'done'; report: WriteReport }

async function findDevice(link: DeviceLink) {
  const all = await listUsbKeyboards()
  const same = all.filter(d => d.vid === link.vid && d.pid === link.pid && d.rawHidPath)
  const exact = link.serial ? same.filter(d => d.serial === link.serial) : same
  const pick = exact[0] ?? (same.length === 1 ? same[0] : undefined)
  if (!pick?.rawHidPath) {
    throw new Error(`The keyboard (${via.hexId(link.vid, link.pid)}) is not connected over USB. Plug it in with a data cable; Bluetooth connections cannot be written.`)
  }
  return pick.rawHidPath
}

const keyName = (n: number) => qmkKeycode(n).name

function WriteToKeyboard({ keyboard, link }: { keyboard: KeyboardDef; link: DeviceLink }) {
  const toast = useToast()
  const [state, setState] = useState<WriteState>({ step: 'idle' })
  const [error, setError] = useState<string | null>(null)

  const withDevice = useCallback(async <T,>(fn: (h: Awaited<ReturnType<typeof openHid>>) => Promise<T>): Promise<T> => {
    const h = await openHid(await findDevice(link))
    try { return await fn(h) } finally { await h.close().catch(() => {}) }
  }, [link])

  const check = async () => {
    setError(null); setState({ step: 'checking' })
    try {
      if (isAnyDirty()) await saveAllDirty()
      const layers = keymapJsonLayers(await readText(keyboard.keymapPath))
      const { plan, shape } = await withDevice(h => previewKeymapWrite(h, link, layers))
      if (shape) throw new Error(shape)
      setState({ step: 'preview', plan, layers })
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e)); setState({ step: 'idle' })
    }
  }

  const write = async (plan: WritePlan, layers: string[][]) => {
    setError(null); setState({ step: 'writing', done: 0, total: plan.writes.length })
    try {
      const report = await withDevice(h => writeKeymapToDevice(h, link, layers, {
        expect: plan,
        saveBackup: snap => saveDeviceBackup(keyboard.name, snap),
        onProgress: (done, total) => setState({ step: 'writing', done, total }),
      }, { experimental: true }))
      setState({ step: 'done', report })
      toast.success(`Wrote ${report.written.length} key${report.written.length === 1 ? '' : 's'} to the keyboard`)
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e)
      setError(e instanceof WriteFailed && e.written.length ? `${msg} Written before it stopped: ${e.written.map(w => `layer ${w.layer} key ${w.index}`).join(', ')}.` : msg)
      setState({ step: 'idle' })
    }
  }

  return (
    <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ ...sectionLabel, whiteSpace: 'nowrap' }}>Write to keyboard</div>
        <span className="tag" style={{ color: 'var(--warning)' }}>Experimental</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{link.protocol === 'vial' ? 'Vial' : 'VIA'} · {via.hexId(link.vid, link.pid)}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
        Not yet tested on a real VIA or Vial keyboard. The app first saves a backup of what is on the keyboard, then writes only the keys
        that differ from the keymap on screen, reads each one back, and checks the whole keymap at the end. Lighting and macros are not written.
      </p>
      {error && <ErrorPanel onRetry={check}>{error}</ErrorPanel>}

      {state.step === 'idle' && (
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={check}>Check what would change</button>
      )}
      {state.step === 'checking' && <span role="status" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Reading the keyboard…</span>}

      {state.step === 'preview' && (state.plan.refused.length > 0 ? (
        <>
          <ErrorPanel>
            {state.plan.refused.length} key{state.plan.refused.length === 1 ? '' : 's'} cannot be written exactly, so nothing will be written:{' '}
            {state.plan.refused.slice(0, 8).map(r => `layer ${r.layer} key ${r.index} (${r.name})`).join(', ')}{state.plan.refused.length > 8 ? ', …' : ''}.
            Change them to plain keycodes, then check again.
          </ErrorPanel>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setState({ step: 'idle' })}>Done</button>
        </>
      ) : state.plan.writes.length === 0 ? (
        <>
          <div role="status" style={{ fontSize: 12, color: 'var(--success)' }}>The keyboard already matches the keymap on screen.</div>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setState({ step: 'idle' })}>Done</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12 }}>{state.plan.writes.length} key{state.plan.writes.length === 1 ? '' : 's'} differ:</div>
          <ChangeList writes={state.plan.writes} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => write(state.plan, state.layers)}>
              <Upload size={12} /> Write {state.plan.writes.length} key{state.plan.writes.length === 1 ? '' : 's'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setState({ step: 'idle' })}>Cancel</button>
          </div>
        </>
      ))}

      {state.step === 'writing' && (
        <span role="status" style={{ fontSize: 12, color: 'var(--warning)' }}>Writing key {Math.min(state.done + 1, state.total)} of {state.total}… keep the keyboard plugged in.</span>
      )}

      {state.step === 'done' && (
        <>
          <div role="status" style={{ fontSize: 12, color: 'var(--success)' }}>
            Wrote and checked {state.report.written.length} key{state.report.written.length === 1 ? '' : 's'}.
          </div>
          {state.report.written.length > 0 && <ChangeList writes={state.report.written} />}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Backup from before writing: <span className="mono">{tail(state.report.backupPath, 3)}</span></div>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setState({ step: 'idle' })}>Done</button>
        </>
      )}
    </section>
  )
}

function ChangeList({ writes }: { writes: WritePlan['writes'] }) {
  return (
    <ul className="panel-inset mono" style={{ margin: 0, padding: '8px 10px 8px 24px', fontSize: 11, maxHeight: 180, overflow: 'auto', lineHeight: 1.7 }}>
      {writes.map(w => (
        <li key={`${w.layer}:${w.index}`}>layer {w.layer}, key {w.index}: {keyName(w.from)} → {w.name}</li>
      ))}
    </ul>
  )
}
