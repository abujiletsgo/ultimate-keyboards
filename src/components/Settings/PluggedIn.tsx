/**
 * Plugged in: keyboards connected over USB. Each card says what the app can
 * do with that firmware and why. Reading a keymap first saves a full backup
 * of what is on the keyboard (Documents/Ultimate Keyboards/device-backups),
 * then shows it on the keyboard's own layout. "Save as keymap file" makes an
 * editable file copy; the keyboard itself is never changed from here except
 * by the explicitly experimental lighting controls (VIA / Vial).
 */
import { useCallback, useEffect, useState } from 'react'
import { mkdir, writeTextFile } from '@tauri-apps/plugin-fs'
import { documentDir, join } from '@tauri-apps/api/path'
import { RefreshCw, Usb } from 'lucide-react'
import PhysicalBoard from '@/components/board/PhysicalBoard'
import { ErrorPanel, Switch, useToast } from '@/components/ui'
import { IS_TAURI } from '@/lib/io'
import {
  detectKeyboards, openHid, snapshotDevice, studio, via, vial,
  type HidHandle, type Identification, type UsbKeyboard, type DeviceSnapshot,
} from '@/lib/device'
import type { KeyboardDef } from '@/lib/registry/types'
import type { PhysicalLayout } from '@/lib/layout'

interface Props { onAdd: (def: Omit<KeyboardDef, 'id' | 'createdAt'>) => void }

const KIND_LABEL: Record<Identification['kind'], string> = {
  'zmk-studio': 'ZMK · Studio', zmk: 'ZMK', vial: 'QMK · Vial', via: 'QMK · VIA', qmk: 'QMK', unknown: 'Unknown',
}

interface ReadResult {
  name: string
  layout: PhysicalLayout
  layers: { name: string; keys: { label: string; sub?: string; title: string; zmk?: string; qmk?: string }[] }[]
  firmware: 'zmk' | 'qmk'
  backupPath: string
  qmkKeyboard?: string
  /** open handle for lighting (VIA / Vial) */
  hid?: HidHandle
  lighting?: 'vialrgb' | 'rgb_matrix' | 'rgblight' | 'backlight' | 'led_matrix' | 'none'
}

async function saveBackup(name: string, snap: DeviceSnapshot): Promise<string> {
  const dir = await join(await documentDir(), 'Ultimate Keyboards', 'device-backups')
  await mkdir(dir, { recursive: true })
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'keyboard'
  const path = await join(dir, `${safe}-${snap.takenAt.replace(/[:.]/g, '-')}.json`)
  await writeTextFile(path, JSON.stringify(snap, null, 2) + '\n')
  return path
}

export default function PluggedIn({ onAdd }: Props) {
  const [devices, setDevices] = useState<Array<{ device: UsbKeyboard; id: Identification }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  const scan = useCallback(async () => {
    setScanning(true); setError(null)
    try { setDevices(await detectKeyboards()) } catch (e) { setError(String(e instanceof Error ? e.message : e)) } finally { setScanning(false) }
  }, [])
  useEffect(() => { if (IS_TAURI) scan() }, [scan])

  if (!IS_TAURI) return <div className="panel-inset" style={{ padding: 14, fontSize: 12 }}>Reading a keyboard over USB needs the desktop app.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-secondary btn-sm" onClick={scan} disabled={scanning}><RefreshCw size={13} /> {scanning ? 'Looking…' : 'Look again'}</button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Plug in one half (usually the left) with a data USB cable. Bluetooth connections cannot be read.</span>
      </div>
      {error && <ErrorPanel onRetry={scan}>{error}</ErrorPanel>}
      {devices && devices.length === 0 && (
        <div className="panel-inset" style={{ padding: 16, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Usb size={18} /> No keyboard found on USB. Some charging cables carry no data; try another cable.
        </div>
      )}
      {devices?.map(({ device, id }) => <DeviceCard key={`${device.vid}:${device.pid}:${device.serial ?? device.serialPort ?? device.rawHidPath}`} device={device} id={id} onAdd={onAdd} />)}
    </div>
  )
}

function Cap({ label, value }: { label: string; value: string }) {
  const color = value === 'Yes' ? 'var(--success)' : value === 'No' ? 'var(--text-muted)' : 'var(--warning)'
  return <span style={{ fontSize: 11 }}><span style={{ color: 'var(--text-muted)' }}>{label}: </span><strong style={{ color }}>{value}</strong></span>
}
const supportText = (s: string) => (s === 'yes' ? 'Yes' : s === 'experimental' ? 'Experimental' : 'No')

function DeviceCard({ device, id, onAdd }: { device: UsbKeyboard; id: Identification; onAdd: Props['onAdd'] }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [read, setRead] = useState<ReadResult | null>(null)
  const [layer, setLayer] = useState(0)

  useEffect(() => () => { read?.hid?.close().catch(() => {}) }, [read])

  const doRead = async () => {
    setBusy(true); setError(null)
    try {
      if (id.kind === 'zmk-studio' && device.serialPort) {
        const r = await studio.readZmkStudio(device.serialPort)
        try {
          const snap = await snapshotDevice({ kind: 'zmk-studio', session: r.session })
          const backupPath = await saveBackup(r.name, snap)
          setRead({
            name: r.name, firmware: 'zmk', backupPath,
            layout: r.layouts[r.activeLayoutIndex] ?? r.layouts[0],
            layers: r.layers.map(l => ({ name: l.name, keys: l.bindings.map(b => ({ label: b.label, sub: b.sub, title: b.zmk ?? `behavior ${b.behaviorId}`, zmk: b.zmk })) })),
          })
        } finally { await r.session.close().catch(() => {}) }
      } else if ((id.kind === 'via' || id.kind === 'vial') && device.rawHidPath) {
        const h = await openHid(device.rawHidPath)
        try {
          if (id.kind === 'vial') {
            const r = await vial.readVial(h, { fallbackName: device.product ?? undefined })
            const snap = await snapshotDevice({ kind: 'vial', handle: h, definition: r.definition })
            const backupPath = await saveBackup(r.name, snap)
            setRead({
              name: r.name, firmware: 'qmk', backupPath, hid: h, lighting: r.lighting, qmkKeyboard: id.qmkKeyboards?.[0],
              layout: r.keymap.definitionLayout.layout,
              layers: r.keymap.labels.map((l, i) => ({ name: `Layer ${i}`, keys: l.map(k => ({ label: k.label, title: k.name, qmk: k.name })) })),
            })
          } else {
            if (!id.viaDefinition) throw new Error(`No VIA definition was found for ${via.hexId(device.vid, device.pid)}, so the key positions are unknown.`)
            const r = await via.readVia(h, id.viaDefinition)
            const snap = await snapshotDevice({ kind: 'via', handle: h, definition: id.viaDefinition })
            const backupPath = await saveBackup(id.name, snap)
            const menus = JSON.stringify(id.viaDefinition.menus ?? [])
            setRead({
              name: id.name, firmware: 'qmk', backupPath, hid: h, qmkKeyboard: id.qmkKeyboards?.[0],
              lighting: menus.includes('rgb_matrix') ? 'rgb_matrix' : menus.includes('rgblight') ? 'rgblight' : menus.includes('backlight') ? 'backlight' : 'none',
              layout: r.definitionLayout.layout,
              layers: r.labels.map((l, i) => ({ name: `Layer ${i}`, keys: l.map(k => ({ label: k.label, title: k.name, qmk: k.name })) })),
            })
          }
        } catch (e) { await h.close().catch(() => {}); throw e }
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally { setBusy(false) }
  }

  /** Editable file copy of what was read. The keyboard is not changed. */
  const saveAsFile = async () => {
    if (!read) return
    try {
      const dir = await join(await documentDir(), 'Ultimate Keyboards', read.name.replace(/[^A-Za-z0-9._-]+/g, '-'))
      await mkdir(dir, { recursive: true })
      if (read.firmware === 'qmk') {
        const path = await join(dir, 'keymap.json')
        const body = { keyboard: read.qmkKeyboard ?? read.name, keymap: 'from-device', layout: read.layout.name, layers: read.layers.map(l => l.keys.map(k => k.qmk ?? 'KC_NO')) }
        await writeTextFile(path, JSON.stringify(body, null, 2) + '\n')
        onAdd({ name: read.name, firmware: 'qmk', keymapPath: path, shield: read.qmkKeyboard, layout: read.layout, pointing: [] })
      } else {
        const path = await join(dir, `${read.name.replace(/[^A-Za-z0-9_]+/g, '_').toLowerCase()}.keymap`)
        const unknown = read.layers.flatMap(l => l.keys).filter(k => !k.zmk).length
        const body = [
          '/* Read from the keyboard over USB (ZMK Studio) by Ultimate Keyboards. */',
          '#include <behaviors.dtsi>', '#include <dt-bindings/zmk/keys.h>', '#include <dt-bindings/zmk/bt.h>', '',
          '/ {', '    keymap {', '        compatible = "zmk,keymap";',
          ...read.layers.map((l, i) => [
            '', `        layer_${i} {`, `            display-name = "${l.name.replace(/"/g, '')}";`,
            `            bindings = <${l.keys.map(k => k.zmk ?? '&none').join(' ')}>;`, '        };',
          ].join('\n')),
          '    };', '};', '',
        ].join('\n')
        await writeTextFile(path, body)
        onAdd({ name: read.name, firmware: 'zmk', keymapPath: path, layout: read.layout, pointing: [] })
        if (unknown) toast.info(`${unknown} key${unknown === 1 ? '' : 's'} used behaviors without a keymap equivalent and were saved as &none`)
      }
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
  }

  const shown = read?.layers[Math.min(layer, (read?.layers.length ?? 1) - 1)]
  return (
    <div className="glass" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{id.name || device.product || 'USB keyboard'}</span>
        <span className="tag">{KIND_LABEL[id.kind]}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{via.hexId(device.vid, device.pid)}</span>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Cap label="Read keymap" value={id.canReadKeymap ? 'Yes' : 'No'} />
        <Cap label="Change keys live" value={supportText(id.liveEdit)} />
        <Cap label="Lighting" value={supportText(id.rgb)} />
        {id.pointerReports && <span style={{ fontSize: 11, color: 'var(--text-muted)' }} title="The keyboard sends mouse reports. That can be a trackball or trackpad, or just mouse keys.">Pointer reports detected</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{id.reason}</div>
      {error && <ErrorPanel onRetry={doRead}>{error}</ErrorPanel>}
      {id.canReadKeymap && !read && (
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={doRead} disabled={busy}>{busy ? 'Reading…' : 'Read keymap from keyboard'}</button>
      )}
      {read && shown && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Backup of what is on the keyboard: <span className="mono">{read.backupPath.split('/').slice(-3).join('/')}</span></div>
          {read.layers.length > 1 && (
            <div className="seg-ctrl" role="tablist" aria-label="Layers" style={{ flexWrap: 'wrap', alignSelf: 'flex-start' }}>
              {read.layers.map((l, i) => <button key={i} role="tab" aria-selected={layer === i} className={`seg-btn${layer === i ? ' active' : ''}`} onClick={() => setLayer(i)}>{i} {l.name}</button>)}
            </div>
          )}
          <PhysicalBoard layout={read.layout} editable={false} maxScale={0.9} label={`${read.name} keymap`}
            keyAt={pos => { const k = shown.keys[pos]; return k ? { label: k.label, sub: k.sub, title: k.title } : null }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={saveAsFile}>Save as keymap file and open it</button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Makes an editable copy in Documents. The keyboard itself is not changed.</span>
          </div>
          {read.hid && read.lighting && read.lighting !== 'none' && <LightingPanel handle={read.hid} kind={read.lighting} />}
        </>
      )}
    </div>
  )
}

// ── Lighting (VIA / Vial), experimental ─────────────────────────────────────

function LightingPanel({ handle, kind }: { handle: HidHandle; kind: NonNullable<ReadResult['lighting']> }) {
  const [enabled, setEnabled] = useState(false)
  const [state, setState] = useState<{ brightness: number; effect: number; speed?: number; hue?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isVialRgb = kind === 'vialrgb'
  const channel = (kind === 'vialrgb' || kind === 'none' ? 'rgb_matrix' : kind) as via.ViaLightingChannel

  useEffect(() => {
    const load = isVialRgb
      ? vial.getVialRgb(handle).then(s => ({ brightness: s.val, effect: s.mode, speed: s.speed, hue: s.hue }))
      : via.getLighting(handle, channel)
    load.then(setState).catch(e => setError(`Could not read lighting: ${e instanceof Error ? e.message : e}`))
  }, [handle, isVialRgb, channel])

  const apply = async (patch: { brightness?: number; effect?: number; speed?: number; hue?: number }) => {
    if (!state) return
    setError(null)
    try {
      if (isVialRgb) {
        const cur = await vial.getVialRgb(handle)
        const s = await vial.setVialRgb(handle, { ...cur, val: patch.brightness ?? cur.val, mode: patch.effect ?? cur.mode, speed: patch.speed ?? cur.speed, hue: patch.hue ?? cur.hue }, { experimental: true })
        setState({ brightness: s.val, effect: s.mode, speed: s.speed, hue: s.hue })
      } else {
        setState(await via.setLighting(handle, channel, patch, { experimental: true }))
      }
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
  }
  const persist = async () => {
    try {
      if (isVialRgb) await vial.saveVialRgb(handle, { experimental: true }); else await via.saveLighting(handle, channel, { experimental: true })
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
  }

  return (
    <div className="panel-inset" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Switch
        checked={enabled} onChange={setEnabled}
        label="Change lighting on the keyboard (experimental)"
        description="Not tested on real VIA or Vial keyboards yet. Changes apply live; they are kept after unplugging only when you press Save to keyboard."
      />
      {error && <ErrorPanel>{error}</ErrorPanel>}
      {enabled && state && (
        <>
          {([['brightness', 'Brightness', 255], ['effect', 'Effect', 64], ['speed', 'Speed', 255], ['hue', 'Colour', 255]] as const)
            .filter(([k]) => state[k] !== undefined)
            .map(([k, label, max]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <span style={{ width: 80 }}>{label}</span>
                <input type="range" min={0} max={max} value={state[k] ?? 0} style={{ flex: 1, accentColor: 'var(--accent)' }}
                  onChange={e => setState(s => (s ? { ...s, [k]: Number(e.target.value) } : s))}
                  onPointerUp={e => apply({ [k]: Number((e.target as HTMLInputElement).value) })}
                  onKeyUp={e => apply({ [k]: Number((e.target as HTMLInputElement).value) })} />
                <span className="mono" style={{ width: 32, textAlign: 'right' }}>{state[k]}</span>
              </label>
            ))}
          <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={persist}>Save to keyboard</button>
        </>
      )}
    </div>
  )
}
