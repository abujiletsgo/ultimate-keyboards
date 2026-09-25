/**
 * USB keyboard detection: what is plugged in, and what the app can do with it.
 *
 *   ZMK   default ids 0x1D50:0x615E, product string = keyboard name. Keymap is
 *         readable only when built with Studio (CDC-ACM port answering RPC).
 *   Vial  USB serial number contains "vial:f64c2b3c" (candidate), confirmed
 *         by the Vial get_keyboard_id handshake; carries its own definition.
 *   VIA   raw HID 0xFF60/0x61 (candidate), confirmed by get_protocol_version;
 *         definition fetched from the VIA app's
 *         https://usevia.app/definitions/v3/{vid*65536+pid}.json (GPL-3 data,
 *         runtime only, never bundled).
 *   QMK   without VIA: named via https://keyboards.qmk.fm/v1/usb.json; the
 *         keymap cannot be read back.
 *
 * Nothing here opens a keyboard (HID keyboard) collection, so no Input
 * Monitoring prompt: only the 0xFF60 interface and the CDC serial port.
 */
import { fetchMetadata, listUsbKeyboards, openHid, type UsbKeyboard } from './bridge'
import { parseDefinition, type KeyboardDefinition } from './definition'
import { probeStudio, STUDIO_ERRORS, type StudioDeviceInfo } from './studio'
import { getProtocolVersion, hexId, VIA_SUPPORTED_PROTOCOLS, viaVpid } from './via'
import { decodeKeyboardId, encodeGetKeyboardId, VIAL_SUPPORTED_PROTOCOLS } from './vial'

export * from './bridge'

export type DeviceKind = 'zmk-studio' | 'zmk' | 'vial' | 'via' | 'qmk' | 'unknown'

/** 'yes': supported; 'experimental': implemented but untested on hardware, writes need { experimental: true }. */
export type Support = 'yes' | 'experimental' | 'no'

export interface Identification {
  /** Handshake-confirmed kind ('zmk' is by USB ids only: nothing to handshake with). */
  kind: DeviceKind
  name: string
  /** Plain-language explanation for the card. */
  reason: string
  canReadKeymap: boolean
  liveEdit: Support
  rgb: Support
  /**
   * "Pointer reports detected" (a HID mouse collection). Mouse keys create one
   * too: never show this as a trackball or trackpad.
   */
  pointerReports: boolean
  /** QMK keyboard folders matching the ids (from usb.json). */
  qmkKeyboards?: string[]
  /** VIA protocol version from the handshake. */
  viaProtocol?: number
  /** Vial protocol version from the handshake. */
  vialProtocol?: number
  studio?: StudioDeviceInfo
  /** VIA definition, when found (kind 'via'). */
  viaDefinition?: KeyboardDefinition
}

export const QMK_USB_JSON = 'https://keyboards.qmk.fm/v1/usb.json'
export const VIA_SUPPORTED_KBS = 'https://usevia.app/definitions/supported_kbs.json'
export const viaDefinitionUrl = (vpid: number) => `https://usevia.app/definitions/v3/${vpid}.json`

// ── Runtime metadata (cached in memory for the session) ─────────────────────

const cache = new Map<string, Promise<unknown>>()

function cachedJson(url: string): Promise<unknown> {
  let p = cache.get(url)
  if (!p) {
    p = fetchMetadata(url).then(t => JSON.parse(t) as unknown)
    p.catch(() => cache.delete(url)) // retry next time after a failure
    cache.set(url, p)
  }
  return p
}

/** Test hook: forget fetched metadata. */
export function clearMetadataCache(): void {
  cache.clear()
}

const idNum = (k: string): number => (/^0x/i.test(k) ? parseInt(k, 16) : Number(k))

/** QMK keyboard folders registered for vid:pid in usb.json ({usb: {vid: {pid: {kb: info}}}}). */
export function qmkKeyboardsFromUsbJson(json: unknown, vid: number, pid: number): string[] {
  const usb = (json as { usb?: unknown })?.usb ?? json
  if (!usb || typeof usb !== 'object') return []
  for (const [v, pids] of Object.entries(usb as Record<string, unknown>)) {
    if (idNum(v) !== vid || !pids || typeof pids !== 'object') continue
    for (const [p, kbs] of Object.entries(pids as Record<string, unknown>)) {
      if (idNum(p) !== pid || !kbs || typeof kbs !== 'object') continue
      return Object.keys(kbs as object)
    }
  }
  return []
}

export async function lookupQmkKeyboards(vid: number, pid: number): Promise<string[]> {
  try {
    return qmkKeyboardsFromUsbJson(await cachedJson(QMK_USB_JSON), vid, pid)
  } catch {
    return []
  }
}

/** All numeric ids in VIA's supported_kbs.json (any array under vendorProductIds). */
export function viaSupportedIds(json: unknown): Set<number> {
  const out = new Set<number>()
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { for (const x of v) if (typeof x === 'number') out.add(x); else walk(x) }
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  walk((json as { vendorProductIds?: unknown })?.vendorProductIds ?? json)
  return out
}

/**
 * Fetch the VIA definition for vid:pid. Throws
 * "VIA definition for 1234:5678 not found" when VIA does not list it.
 */
export async function fetchViaDefinition(vid: number, pid: number): Promise<KeyboardDefinition> {
  const vpid = viaVpid(vid, pid)
  const notFound = new Error(`VIA definition for ${hexId(vid, pid)} not found`)
  try {
    const supported = viaSupportedIds(await cachedJson(VIA_SUPPORTED_KBS))
    if (supported.size > 0 && !supported.has(vpid)) throw notFound
  } catch (e) {
    if (e === notFound) throw e
    // List unavailable: try the definition directly.
  }
  let json: unknown
  try {
    json = await cachedJson(viaDefinitionUrl(vpid))
  } catch (e) {
    if (/HTTP 4\d\d/.test(String(e))) throw notFound
    throw new Error(`Could not download the VIA definition for ${hexId(vid, pid)}: ${e instanceof Error ? e.message : String(e)}`)
  }
  return parseDefinition(json)
}

// ── identify ────────────────────────────────────────────────────────────────

export interface IdentifyDeps {
  probeStudio: (serialPort: string, timeoutMs: number) => Promise<StudioDeviceInfo | null>
  /** VIA get_protocol_version over the raw HID interface; null when no valid reply. */
  probeViaProtocol: (rawHidPath: string) => Promise<number | null>
  /** Vial get_keyboard_id; the Vial protocol number, or null when no valid reply. */
  probeVialProtocol: (rawHidPath: string) => Promise<number | null>
  lookupQmkKeyboards: (vid: number, pid: number) => Promise<string[]>
  fetchViaDefinition: (vid: number, pid: number) => Promise<KeyboardDefinition>
}

async function withHid<T>(rawHidPath: string, f: (h: Awaited<ReturnType<typeof openHid>>) => Promise<T>): Promise<T | null> {
  let h
  try {
    h = await openHid(rawHidPath)
    return await f(h)
  } catch {
    return null
  } finally {
    await h?.close()
  }
}

const defaultDeps: IdentifyDeps = {
  probeStudio,
  probeViaProtocol: path => withHid(path, getProtocolVersion),
  probeVialProtocol: path => withHid(path, async h => decodeKeyboardId(await h.transact(encodeGetKeyboardId())).protocol),
  lookupQmkKeyboards,
  fetchViaDefinition,
}

function displayName(dev: UsbKeyboard): string {
  return dev.product || dev.manufacturer || `USB keyboard ${hexId(dev.vid, dev.pid)}`
}

const hex4 = (v: number) => '0x' + v.toString(16).toUpperCase().padStart(4, '0')

/**
 * Decide what a connected keyboard is and what can be done with it.
 * Enumeration flags are only candidates; the kind returned is confirmed by a
 * handshake: ZMK → Studio get_device_info (2 s); Vial → get_keyboard_id with
 * a supported protocol; VIA → get_protocol_version 0x000C/0x000D. QMK names
 * come from usb.json. Anything unconfirmed is 'unknown' with a reason.
 * Never throws.
 */
export async function identify(dev: UsbKeyboard, deps: Partial<IdentifyDeps> = {}): Promise<Identification> {
  const d = { ...defaultDeps, ...deps }
  const name = displayName(dev)
  const base = { name, pointerReports: dev.pointerReports, canReadKeymap: false, liveEdit: 'no' as Support, rgb: 'no' as Support }

  if (dev.isZmk) {
    if (dev.serialPort) {
      const info = await d.probeStudio(dev.serialPort, 2000).catch(() => null)
      if (info) {
        return {
          ...base,
          kind: 'zmk-studio',
          name: info.name || name,
          studio: info,
          canReadKeymap: true,
          liveEdit: 'yes',
          reason: 'ZMK with Studio: the keymap can be read and edited live (unlock with the Studio unlock key first).',
        }
      }
    }
    return { ...base, kind: 'zmk', reason: STUDIO_ERRORS.noStudio }
  }

  if (dev.isVial && dev.rawHidPath) {
    const vialProtocol = await d.probeVialProtocol(dev.rawHidPath).catch(() => null)
    if (vialProtocol === null) {
      return { ...base, kind: 'unknown', reason: 'Its serial number says Vial, but it did not answer the Vial handshake.' }
    }
    if (!VIAL_SUPPORTED_PROTOCOLS.includes(vialProtocol)) {
      return { ...base, kind: 'unknown', vialProtocol, reason: `Vial protocol ${vialProtocol} is not supported (need ${VIAL_SUPPORTED_PROTOCOLS.join(', ')}). Update the keyboard's firmware.` }
    }
    return {
      ...base,
      kind: 'vial',
      vialProtocol,
      canReadKeymap: true,
      liveEdit: 'experimental',
      rgb: 'experimental',
      reason: 'Vial keyboard: the keymap can be read. Live edits and lighting are experimental (not tested on hardware).',
    }
  }

  const qmkKeyboards = await d.lookupQmkKeyboards(dev.vid, dev.pid).catch(() => [] as string[])

  if (dev.rawHidPath) {
    const viaProtocol = await d.probeViaProtocol(dev.rawHidPath).catch(() => null)
    if (viaProtocol !== null && !VIA_SUPPORTED_PROTOCOLS.includes(viaProtocol)) {
      return { ...base, kind: 'unknown', qmkKeyboards, viaProtocol, reason: `VIA protocol ${hex4(viaProtocol)} is not supported (need 0x000C or 0x000D). Update the keyboard's firmware.` }
    }
    if (viaProtocol !== null) {
      try {
        const viaDefinition = await d.fetchViaDefinition(dev.vid, dev.pid)
        return {
          ...base,
          kind: 'via',
          name: viaDefinition.name || name,
          qmkKeyboards,
          viaProtocol,
          viaDefinition,
          canReadKeymap: true,
          liveEdit: 'experimental',
          rgb: 'experimental',
          reason: 'VIA keyboard: the keymap can be read. Live edits and lighting are experimental (not tested on hardware).',
        }
      } catch (e) {
        return {
          ...base,
          kind: 'via',
          qmkKeyboards,
          viaProtocol,
          reason: `${e instanceof Error ? e.message : String(e)}. The keyboard speaks VIA, but without its definition the keys cannot be placed.`,
        }
      }
    }
  }

  if (qmkKeyboards.length > 0) {
    return {
      ...base,
      kind: 'qmk',
      qmkKeyboards,
      reason: 'QMK keyboard without VIA or Vial: its keymap cannot be read over USB. Pick it from the QMK catalogue instead.',
    }
  }

  return {
    ...base,
    kind: 'unknown',
    reason: 'Unrecognised keyboard: no ZMK Studio, Vial or VIA handshake succeeded. Pick it from the catalogue if it is listed.',
  }
}

/** List + identify every connected keyboard. */
export async function detectKeyboards(deps: Partial<IdentifyDeps> = {}): Promise<Array<{ device: UsbKeyboard; id: Identification }>> {
  const devices = await listUsbKeyboards()
  return Promise.all(devices.map(async device => ({ device, id: await identify(device, deps) })))
}
