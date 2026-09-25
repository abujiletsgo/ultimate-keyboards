/**
 * Typed wrappers over the Rust device commands (src-tauri/src/device.rs).
 * The protocol clients (studio.ts, via.ts, vial.ts) only see the small
 * `SerialBridge` / `HidHandle` interfaces, so tests can swap in fakes.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/** One physical USB keyboard (serial ports and HID interfaces merged). */
export interface UsbKeyboard {
  vid: number
  pid: number
  product: string | null
  manufacturer: string | null
  serial: string | null
  /** `/dev/cu.usbmodem…` when the device has a CDC-ACM port (ZMK Studio). */
  serialPort: string | null
  /** hidapi path of the 0xFF60 raw HID interface (VIA / Vial). */
  rawHidPath: string | null
  /** Candidate only (ids / manufacturer string); confirmed by identify(). */
  isZmk: boolean
  /** Candidate only (serial-number magic); confirmed by the Vial handshake in identify(). */
  isVial: boolean
  hasKeyboardInterface: boolean
  /**
   * "Pointer reports detected": the device has a HID mouse collection. QMK/ZMK
   * mouse keys create one too, so never present this as a trackball/trackpad.
   */
  pointerReports: boolean
}

/** Enumerate connected USB keyboards. Opens nothing. */
export function listUsbKeyboards(): Promise<UsbKeyboard[]> {
  return invoke<UsbKeyboard[]>('list_usb_keyboards')
}

// ── Raw HID ─────────────────────────────────────────────────────────────────

/** A 32-byte-report request/response channel (VIA / Vial raw HID). */
export interface HidHandle {
  /** Bridge id, needed by `vial_definition`. 0 for test fakes. */
  readonly id: number
  transact(report: ArrayLike<number>, timeoutMs?: number): Promise<Uint8Array>
  close(): Promise<void>
}

export async function openHid(rawHidPath: string): Promise<HidHandle> {
  const id = await invoke<number>('hid_open', { path: rawHidPath })
  let closed = false
  return {
    id,
    async transact(report, timeoutMs = 500) {
      if (closed) throw new Error('HID device is closed')
      const bytes = await invoke<number[]>('hid_transact', { id, report: Array.from(report), timeoutMs })
      return Uint8Array.from(bytes)
    },
    async close() {
      if (closed) return
      closed = true
      await invoke('hid_close', { id }).catch(() => undefined)
    },
  }
}

/** Read vial.json (decompressed in Rust) over an open raw HID bridge. */
export function readVialDefinitionText(handle: HidHandle): Promise<string> {
  return invoke<string>('vial_definition', { id: handle.id })
}

// ── Serial ──────────────────────────────────────────────────────────────────

export interface SerialBridge {
  readonly id: number
  write(bytes: Uint8Array): Promise<void>
  close(): Promise<void>
  /** Incoming bytes. One listener; replaces any previous one. */
  onData(cb: (bytes: Uint8Array) => void): void
  /** Called once when the port closes (error is null after a normal close). */
  onClosed(cb: (error: string | null) => void): void
}

interface SerialDataEvent { id: number; bytes: number[] }
interface SerialClosedEvent { id: number; error: string | null }

interface Route { data?: (b: Uint8Array) => void; closed?: (e: string | null) => void; pending: Uint8Array[]; done?: string | null }
const routes = new Map<number, Route>()
let listening: Promise<UnlistenFn[]> | null = null

function routeFor(id: number): Route {
  let r = routes.get(id)
  if (!r) { r = { pending: [] }; routes.set(id, r) }
  return r
}

function ensureListening(): Promise<UnlistenFn[]> {
  if (!listening) {
    listening = Promise.all([
      // Events can beat `serial_open`'s reply, so unknown ids get a route too.
      listen<SerialDataEvent>('serial-data', e => {
        const r = routeFor(e.payload.id)
        const bytes = Uint8Array.from(e.payload.bytes)
        if (r.data) r.data(bytes)
        else if (r.pending.length < 256) r.pending.push(bytes)
      }),
      listen<SerialClosedEvent>('serial-closed', e => {
        const r = routeFor(e.payload.id)
        r.done = e.payload.error
        if (r.closed) {
          routes.delete(e.payload.id)
          r.closed(e.payload.error)
        }
      }),
    ])
  }
  return listening
}

export async function openSerial(path: string): Promise<SerialBridge> {
  await ensureListening()
  const id = await invoke<number>('serial_open', { path })
  const route = routeFor(id)
  return {
    id,
    write: bytes => invoke('serial_write', { id, bytes: Array.from(bytes) }),
    close: async () => { await invoke('serial_close', { id }).catch(() => undefined) },
    onData(cb) {
      route.data = cb
      for (const b of route.pending.splice(0)) cb(b)
    },
    onClosed(cb) {
      route.closed = cb
      if (route.done !== undefined) {
        routes.delete(id)
        cb(route.done)
      }
    },
  }
}

// ── Metadata fetch ──────────────────────────────────────────────────────────

export type MetadataFetcher = (url: string) => Promise<string>

/** Default: Rust `fetch_device_metadata` (allow-listed hosts, https only). */
let fetcher: MetadataFetcher = url => invoke<string>('fetch_device_metadata', { url })

/** Swap the fetcher (tests, or a webview `fetch` once the CSP allows the host). */
export function setMetadataFetcher(f: MetadataFetcher): void {
  fetcher = f
}

export function fetchMetadata(url: string): Promise<string> {
  return fetcher(url)
}
