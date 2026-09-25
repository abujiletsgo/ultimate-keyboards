/**
 * ZMK Studio client over the Rust serial bridge.
 *
 * Wire format (zmk app/src/studio/uart_rpc_transport.c + msg_framing.c,
 * mirrored by @zmkfirmware/zmk-studio-ts-client framing.ts, MIT):
 *   SOF 0xAB, payload with 0xAB/0xAC/0xAD each preceded by ESC 0xAC, EOF 0xAD.
 * Payloads are protobuf messages from zmkfirmware/zmk-studio-messages (MIT);
 * encoding, request ids and responses are handled by the official TS client,
 * which takes any `RpcTransport` (readable/writable byte streams). This file
 * adapts our `SerialBridge` to that transport and turns the RPC results into
 * the app's types.
 *
 * Locking: keymap RPCs fail with UNLOCK_REQUIRED until the user presses the
 * `&studio_unlock` key on the keyboard; get_device_info and get_lock_state
 * work while locked.
 */
import {
  call_rpc,
  create_rpc_connection,
  MetaError,
  type Notification,
  type RequestResponse,
  type RpcConnection,
} from '@zmkfirmware/zmk-studio-ts-client'
import type { RpcTransport } from '@zmkfirmware/zmk-studio-ts-client/transport/index'
import { LockState } from '@zmkfirmware/zmk-studio-ts-client/core'
import { ErrorConditions } from '@zmkfirmware/zmk-studio-ts-client/meta'
import type {
  BehaviorBinding,
  Keymap,
  PhysicalLayouts,
} from '@zmkfirmware/zmk-studio-ts-client/keymap'
import type { GetBehaviorDetailsResponse, BehaviorParameterValueDescription } from '@zmkfirmware/zmk-studio-ts-client/behaviors'
import type { PhysicalKey, PhysicalLayout } from '../layout/types'
import { normalizeLayout, round3 } from '../layout/types'
import { openSerial, type SerialBridge } from './bridge'
import { hidUsageToZmk, zmkBindingLabels } from './keycodes'

// ── Framing (pure; the TS client does its own, these are for resync + tests) ─

export const SOF = 0xab
export const ESC = 0xac
export const EOF = 0xad

/** Wrap one payload in a Studio frame, escaping SOF/ESC/EOF bytes. */
export function encodeFrame(payload: ArrayLike<number>): Uint8Array {
  const out: number[] = [SOF]
  for (let i = 0; i < payload.length; i++) {
    const b = payload[i]
    if (b === SOF || b === ESC || b === EOF) out.push(ESC)
    out.push(b)
  }
  out.push(EOF)
  return Uint8Array.from(out)
}

/**
 * Streaming frame decoder that tolerates noise: bytes outside a frame are
 * dropped and a SOF inside a frame restarts it. `push` returns the unescaped
 * payloads completed by this chunk.
 */
export class FrameDecoder {
  private inFrame = false
  private escaped = false
  private buf: number[] = []
  push(chunk: ArrayLike<number>): Uint8Array[] {
    const out: Uint8Array[] = []
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i]
      if (!this.inFrame) {
        if (b === SOF) { this.inFrame = true; this.escaped = false; this.buf = [] }
        continue
      }
      if (this.escaped) { this.buf.push(b); this.escaped = false; continue }
      if (b === ESC) { this.escaped = true; continue }
      if (b === SOF) { this.buf = []; continue }
      if (b === EOF) { out.push(Uint8Array.from(this.buf)); this.inFrame = false; this.buf = []; continue }
      this.buf.push(b)
    }
    return out
  }
}

/**
 * Like FrameDecoder but returns whole frames still escaped (SOF…EOF). Used in
 * front of the TS client, whose strict decoder errors out on stray bytes
 * (e.g. a boot banner) and would kill the connection.
 */
export class FrameSync {
  private inFrame = false
  private escaped = false
  private buf: number[] = []
  push(chunk: ArrayLike<number>): Uint8Array[] {
    const out: Uint8Array[] = []
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i]
      if (!this.inFrame) {
        if (b === SOF) { this.inFrame = true; this.escaped = false; this.buf = [SOF] }
        continue
      }
      if (this.escaped) { this.buf.push(b); this.escaped = false; continue }
      if (b === ESC) { this.buf.push(b); this.escaped = true; continue }
      if (b === SOF) { this.buf = [SOF]; continue }
      this.buf.push(b)
      if (b === EOF) { out.push(Uint8Array.from(this.buf)); this.inFrame = false; this.buf = [] }
    }
    return out
  }
}

/**
 * Collects the client's many small encoder chunks (SOF, data runs, ESC, EOF)
 * and releases one buffer per complete frame, so each request is one IPC call.
 */
export class FrameCoalescer {
  private escaped = false
  private buf: number[] = []
  push(chunk: ArrayLike<number>): Uint8Array[] {
    const out: Uint8Array[] = []
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i]
      this.buf.push(b)
      if (this.escaped) { this.escaped = false; continue }
      if (b === ESC) { this.escaped = true; continue }
      if (b === EOF) { out.push(Uint8Array.from(this.buf)); this.buf = [] }
    }
    return out
  }
}

// ── Transport + session ─────────────────────────────────────────────────────

/** Adapt a serial bridge to the TS client's RpcTransport. */
export function bridgeTransport(bridge: SerialBridge, label = 'serial'): RpcTransport {
  const abortController = new AbortController()
  const sync = new FrameSync()
  const coalesce = new FrameCoalescer()
  let readCtl: ReadableStreamDefaultController<Uint8Array> | null = null
  let closed = false
  const finish = (err?: string | null) => {
    if (closed) return
    closed = true
    try { if (err) readCtl?.error(new Error(err)); else readCtl?.close() } catch { /* already closed */ }
    if (!abortController.signal.aborted) abortController.abort(err ?? 'closed')
  }
  const readable = new ReadableStream<Uint8Array>({
    start(ctl) {
      readCtl = ctl
      bridge.onData(bytes => {
        if (closed) return
        for (const frame of sync.push(bytes)) ctl.enqueue(frame)
      })
      bridge.onClosed(err => finish(err))
    },
    cancel() { finish(); void bridge.close() },
  })
  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      for (const frame of coalesce.push(chunk)) await bridge.write(frame)
    },
    close() { finish(); return bridge.close() },
    abort() { finish(); return bridge.close() },
  })
  abortController.signal.addEventListener('abort', () => { finish(); void bridge.close() })
  return { label, abortController, readable, writable }
}

export interface StudioSession {
  conn: RpcConnection
  transport: RpcTransport
  /** Latest lock state seen (updated from notifications). */
  lockState: 'locked' | 'unlocked' | 'unknown'
  /** Subscribe to lock / unsaved-changes notifications. Returns an unsubscribe. */
  onNotification(cb: (n: Notification) => void): () => void
  close(): Promise<void>
}

export const STUDIO_ERRORS = {
  noStudio:
    'This ZMK keyboard was built without Studio, so its keymap cannot be read. Pick it from the catalogue instead, or rebuild with Studio.',
  locked: 'Keyboard is locked: press the Studio unlock key',
  timeout: 'The keyboard did not answer in time',
} as const

export class StudioLockedError extends Error {
  constructor() { super(STUDIO_ERRORS.locked); this.name = 'StudioLockedError' }
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => { onTimeout(); reject(new Error(message)) }, ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

/** Open a Studio session on an already-open byte transport (tests use this directly). */
export function sessionFromTransport(transport: RpcTransport): StudioSession {
  const conn = create_rpc_connection(transport, { signal: transport.abortController.signal })
  const listeners = new Set<(n: Notification) => void>()
  const session: StudioSession = {
    conn,
    transport,
    lockState: 'unknown',
    onNotification(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    async close() {
      if (!transport.abortController.signal.aborted) transport.abortController.abort('closed')
    },
  }
  // Drain notifications so the tee'd stream never backs up.
  void (async () => {
    const reader = conn.notification_readable.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const ls = value.core?.lockStateChanged
        if (ls !== undefined) session.lockState = ls === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED ? 'unlocked' : 'locked'
        for (const l of listeners) l(value)
      }
    } catch { /* connection closed */ }
  })()
  return session
}

export async function openStudio(serialPort: string): Promise<StudioSession> {
  const bridge = await openSerial(serialPort)
  return sessionFromTransport(bridgeTransport(bridge, serialPort))
}

async function rpc(
  session: StudioSession,
  req: Parameters<typeof call_rpc>[1],
  timeoutMs = 5000,
): Promise<RequestResponse> {
  try {
    return await withTimeout(call_rpc(session.conn, req), timeoutMs, () => void session.close(), STUDIO_ERRORS.timeout)
  } catch (e) {
    if (e instanceof MetaError && e.condition === ErrorConditions.UNLOCK_REQUIRED) throw new StudioLockedError()
    if (e instanceof Error) throw e
    throw new Error(String(e))
  }
}

export interface StudioDeviceInfo { name: string; serialNumber: string }

function hexBytes(b: Uint8Array | undefined): string {
  return b ? Array.from(b, x => x.toString(16).padStart(2, '0')).join('') : ''
}

export async function getDeviceInfo(session: StudioSession, timeoutMs = 5000): Promise<StudioDeviceInfo> {
  const r = await rpc(session, { core: { getDeviceInfo: true } }, timeoutMs)
  const info = r.core?.getDeviceInfo
  if (!info) throw new Error('Studio: empty device info')
  return { name: info.name, serialNumber: hexBytes(info.serialNumber) }
}

export async function getLockState(session: StudioSession): Promise<'locked' | 'unlocked'> {
  const r = await rpc(session, { core: { getLockState: true } })
  const s = r.core?.getLockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED ? 'unlocked' : 'locked'
  session.lockState = s
  return s
}

/**
 * Probe a ZMK serial port for Studio: open, get_device_info with a timeout,
 * close. Resolves with the device info, or null when nothing answered.
 */
export async function probeStudio(serialPort: string, timeoutMs = 2000): Promise<StudioDeviceInfo | null> {
  let session: StudioSession | null = null
  try {
    session = await openStudio(serialPort)
    return await getDeviceInfo(session, timeoutMs)
  } catch {
    return null
  } finally {
    await session?.close()
  }
}

// ── Read keymap ─────────────────────────────────────────────────────────────

export interface StudioBehavior {
  id: number
  displayName: string
  /** ZMK reference when recognised, e.g. `&kp`. */
  ref?: string
  details: GetBehaviorDetailsResponse
}

export interface StudioBinding {
  behaviorId: number
  param1: number
  param2: number
  /** Equivalent ZMK keymap binding when it can be expressed, e.g. `&lt 1 SPACE`. */
  zmk?: string
  label: string
  sub?: string
}

export interface StudioLayer {
  /** Studio layer id (stable across moves); bindings' layer params use ids. */
  id: number
  index: number
  name: string
  bindings: StudioBinding[]
}

export interface StudioKeymapRead {
  name: string
  serialNumber: string
  lockState: 'locked' | 'unlocked'
  layouts: PhysicalLayout[]
  activeLayoutIndex: number
  layers: StudioLayer[]
  availableLayers: number
  maxLayerNameLength: number
  behaviors: StudioBehavior[]
  unsavedChanges: boolean
  /** Still open; use for setBinding/save/discard and close() when done. */
  session: StudioSession
}

/**
 * ZMK behavior display-names (zmk app/dts/behaviors/*.dtsi `display-name`)
 * → keymap reference. Unknown names still get a readable label.
 */
const BEHAVIOR_REFS: Record<string, string> = {
  'key press': '&kp', 'momentary layer': '&mo', 'toggle layer': '&tog', 'to layer': '&to',
  'layer-tap': '&lt', 'mod-tap': '&mt', transparent: '&trans', none: '&none', 'sticky key': '&sk',
  'sticky layer': '&sl', bluetooth: '&bt', 'output selection': '&out', 'caps word': '&caps_word',
  'key repeat': '&key_repeat', reset: '&sys_reset', bootloader: '&bootloader', 'soft off': '&soft_off',
  'studio unlock': '&studio_unlock', 'key toggle': '&kt', 'grave/escape': '&gresc', 'mouse key press': '&mkp',
}

/** zmk dt-bindings/zmk/bt.h and outputs.h command values. */
const BT_CMDS: Record<number, string> = { 0: 'BT_CLR', 1: 'BT_NXT', 2: 'BT_PRV', 3: 'BT_SEL', 4: 'BT_CLR_ALL', 5: 'BT_DISC' }
const OUT_CMDS: Record<number, string> = { 0: 'OUT_TOG', 1: 'OUT_USB', 2: 'OUT_BLE' }
/** zmk dt-bindings/zmk/mouse.h button bits. */
const MOUSE_BTNS: Record<number, string> = { 1: 'LCLK', 2: 'RCLK', 4: 'MCLK', 8: 'MB4', 16: 'MB5' }

function matches(d: BehaviorParameterValueDescription, v: number): boolean {
  if (d.nil) return v === 0
  if (d.constant !== undefined) return d.constant === v
  if (d.range) return v >= d.range.min && v <= d.range.max
  if (d.hidUsage || d.layerId) return true
  return false
}

type ParamKind = 'nil' | 'hid' | 'layer' | 'value' | 'constant'

function describeParam(descs: BehaviorParameterValueDescription[], v: number): { kind: ParamKind; name?: string } {
  if (descs.length === 0) return { kind: 'nil' }
  const d = descs.find(x => matches(x, v)) ?? descs[0]
  if (d.nil) return { kind: 'nil' }
  if (d.hidUsage) return { kind: 'hid' }
  if (d.layerId) return { kind: 'layer' }
  if (d.constant !== undefined) return { kind: 'constant', name: d.name }
  return { kind: 'value', name: d.name }
}

/** Behavior + params → ZMK binding text and keycap labels. */
export function describeBinding(
  b: BehaviorBinding,
  behaviors: Map<number, StudioBehavior>,
  layerIndexById: Map<number, number> = new Map(),
): StudioBinding {
  const base = { behaviorId: b.behaviorId, param1: b.param1, param2: b.param2 }
  const beh = behaviors.get(b.behaviorId)
  if (!beh) return { ...base, label: `#${b.behaviorId}` }
  const ref = beh.ref
  const sets = beh.details.metadata
  const set = sets.find(s => (s.param1.length === 0 || s.param1.some(d => matches(d, b.param1))) && (s.param2.length === 0 || s.param2.some(d => matches(d, b.param2)))) ?? sets[0]
  const p1 = describeParam(set?.param1 ?? [], b.param1)
  const p2 = describeParam(set?.param2 ?? [], b.param2)
  const expr = (p: { kind: ParamKind }, v: number): string | null => {
    if (p.kind === 'nil') return ''
    if (p.kind === 'hid') return hidUsageToZmk(v)
    if (p.kind === 'layer') return String(layerIndexById.get(v) ?? v)
    return null
  }
  let zmk: string | undefined
  if (ref === '&bt' && BT_CMDS[b.param1]) zmk = ['&bt', BT_CMDS[b.param1], ...(b.param1 === 3 || b.param1 === 5 ? [String(b.param2)] : [])].join(' ')
  else if (ref === '&out' && OUT_CMDS[b.param1]) zmk = `&out ${OUT_CMDS[b.param1]}`
  else if (ref === '&mkp') zmk = `&mkp ${MOUSE_BTNS[b.param1] ?? String(b.param1)}`
  else if (ref) {
    const e1 = expr(p1, b.param1)
    const e2 = expr(p2, b.param2)
    if (e1 !== null && e2 !== null) zmk = [ref, e1, e2].filter(Boolean).join(' ')
  }
  if (zmk) return { ...base, zmk, ...zmkBindingLabels(zmk) }
  const named = p1.name ?? p2.name
  return { ...base, label: (named ?? beh.displayName).slice(0, 6), sub: beh.displayName.toLowerCase() }
}

/** Studio physical layout (centi-keyunits, centidegrees) → app PhysicalLayout. */
export function studioLayoutToPhysical(l: PhysicalLayouts['layouts'][number], origin?: string): PhysicalLayout {
  const keys: PhysicalKey[] = l.keys.map(k => {
    const key: PhysicalKey = { x: round3(k.x / 100), y: round3(k.y / 100) }
    if (k.width !== 100) key.w = round3(k.width / 100)
    if (k.height !== 100) key.h = round3(k.height / 100)
    if (k.r) { key.r = round3(k.r / 100); key.rx = round3(k.rx / 100); key.ry = round3(k.ry / 100) }
    return key
  })
  return normalizeLayout({ name: l.name, keys, source: 'zmk-physical-layout', origin })
}

/** Raw keymap (all layers) for snapshots: [layerId, name, [behaviorId, p1, p2][]][]. */
export async function readRawKeymap(session: StudioSession): Promise<Array<{ id: number; name: string; bindings: Array<[number, number, number]> }>> {
  return (await getKeymap(session)).layers.map(l => ({
    id: l.id,
    name: l.name,
    bindings: l.bindings.map(b => [b.behaviorId, b.param1, b.param2] as [number, number, number]),
  }))
}

export async function listBehaviors(session: StudioSession): Promise<StudioBehavior[]> {
  const r = await rpc(session, { behaviors: { listAllBehaviors: true } })
  const ids = r.behaviors?.listAllBehaviors?.behaviors ?? []
  const out: StudioBehavior[] = []
  for (const id of ids) {
    const d = await rpc(session, { behaviors: { getBehaviorDetails: { behaviorId: id } } })
    const details = d.behaviors?.getBehaviorDetails
    if (!details) continue
    out.push({ id, displayName: details.displayName, ref: BEHAVIOR_REFS[details.displayName.trim().toLowerCase()], details })
  }
  return out
}

/**
 * Read everything Studio exposes: device name, lock state, physical layouts,
 * layers with labelled bindings, behaviors. Accepts a serial port path (a
 * session is opened and left open in the result) or an existing session.
 * Throws StudioLockedError ("Keyboard is locked: press the Studio unlock key")
 * when locked, and STUDIO_ERRORS.noStudio when nothing answers.
 */
export async function readZmkStudio(target: string | StudioSession): Promise<StudioKeymapRead> {
  const owned = typeof target === 'string'
  const session = owned ? await openStudio(target) : target
  try {
    let info: StudioDeviceInfo
    try {
      info = await getDeviceInfo(session, 2000)
    } catch (e) {
      if (e instanceof StudioLockedError) throw e
      throw new Error(STUDIO_ERRORS.noStudio)
    }
    const lockState = await getLockState(session)
    if (lockState === 'locked') throw new StudioLockedError()
    const layoutsResp = (await rpc(session, { keymap: { getPhysicalLayouts: true } })).keymap?.getPhysicalLayouts
    const keymap = await getKeymap(session)
    const behaviors = await listBehaviors(session)
    const unsaved = (await rpc(session, { keymap: { checkUnsavedChanges: true } })).keymap?.checkUnsavedChanges ?? false
    const byId = new Map(behaviors.map(b => [b.id, b]))
    const layerIndexById = new Map(keymap.layers.map((l, i) => [l.id, i]))
    return {
      name: info.name,
      serialNumber: info.serialNumber,
      lockState,
      layouts: (layoutsResp?.layouts ?? []).map(l => studioLayoutToPhysical(l, `studio:${info.name}`)),
      activeLayoutIndex: layoutsResp?.activeLayoutIndex ?? 0,
      layers: keymap.layers.map((l, index) => ({
        id: l.id,
        index,
        name: l.name || `Layer ${index}`,
        bindings: l.bindings.map(b => describeBinding(b, byId, layerIndexById)),
      })),
      availableLayers: keymap.availableLayers,
      maxLayerNameLength: keymap.maxLayerNameLength,
      behaviors,
      unsavedChanges: unsaved,
      session,
    }
  } catch (e) {
    if (owned) await session.close()
    throw e
  }
}

// ── Live edit ───────────────────────────────────────────────────────────────

const SET_BINDING_ERRORS: Record<number, string> = {
  1: 'invalid key position or layer',
  2: 'the keyboard does not know that behavior',
  3: 'invalid parameters for that behavior',
}

async function getKeymap(session: StudioSession): Promise<Keymap> {
  const keymap = (await rpc(session, { keymap: { getKeymap: true } })).keymap?.getKeymap
  if (!keymap) throw new Error('Studio: the keyboard returned no keymap')
  return keymap
}

/**
 * Change one binding in the keyboard's RAM (persisted only by save(), undone
 * by discard()), then re-read the keymap and throw if the key differs.
 */
export async function setBinding(
  session: StudioSession,
  layerId: number,
  keyPosition: number,
  binding: { behaviorId: number; param1: number; param2: number },
): Promise<void> {
  const r = await rpc(session, { keymap: { setLayerBinding: { layerId, keyPosition, binding } } })
  const code = r.keymap?.setLayerBinding ?? 0
  if (code !== 0) throw new Error(`Could not set the key: ${SET_BINDING_ERRORS[code] ?? `error ${code}`}`)
  const back = (await getKeymap(session)).layers.find(l => l.id === layerId)?.bindings[keyPosition]
  if (!back || back.behaviorId !== binding.behaviorId || back.param1 !== binding.param1 || back.param2 !== binding.param2) {
    throw new Error(`Read-back mismatch at layer ${layerId} key ${keyPosition}: the keyboard did not keep the new binding`)
  }
}

export async function hasUnsavedChanges(session: StudioSession): Promise<boolean> {
  return (await rpc(session, { keymap: { checkUnsavedChanges: true } })).keymap?.checkUnsavedChanges ?? false
}

const SAVE_ERRORS: Record<number, string> = { 1: 'generic failure', 2: 'saving is not supported', 3: 'no space left on the keyboard' }

/** Persist live changes to the keyboard's flash. */
export async function save(session: StudioSession): Promise<void> {
  const r = (await rpc(session, { keymap: { saveChanges: true } })).keymap?.saveChanges
  if (r?.err !== undefined && r.err !== 0) throw new Error(`Could not save: ${SAVE_ERRORS[r.err] ?? `error ${r.err}`}`)
}

/** Drop live changes and reload the saved keymap on the keyboard. */
export async function discard(session: StudioSession): Promise<void> {
  const ok = (await rpc(session, { keymap: { discardChanges: true } })).keymap?.discardChanges
  if (ok === false) throw new Error('Could not discard changes')
}
