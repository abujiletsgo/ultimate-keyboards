import { describe, expect, test } from 'bun:test'
import { get_decoder, get_encoder } from '@zmkfirmware/zmk-studio-ts-client/framing'
import { Request, Response, type RequestResponse } from '@zmkfirmware/zmk-studio-ts-client/studio'
import { LockState } from '@zmkfirmware/zmk-studio-ts-client/core'
import { ErrorConditions } from '@zmkfirmware/zmk-studio-ts-client/meta'
import {
  bridgeTransport, describeBinding, discard, encodeFrame, EOF, ESC, FrameCoalescer, FrameDecoder, FrameSync,
  getDeviceInfo, readZmkStudio, save, sessionFromTransport, setBinding, SOF, STUDIO_ERRORS, StudioLockedError,
  studioLayoutToPhysical, type StudioBehavior,
} from '../src/lib/device/studio'
import type { SerialBridge } from '../src/lib/device/bridge'
import { snapshotDevice } from '../src/lib/device/snapshot'

async function throughTransform(t: Transformer<Uint8Array, Uint8Array>, chunks: Uint8Array[]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = []
  const ts = new TransformStream(t)
  const w = ts.writable.getWriter()
  const reading = (async () => {
    const r = ts.readable.getReader()
    for (;;) { const { done, value } = await r.read(); if (done) break; out.push(value) }
  })()
  for (const c of chunks) await w.write(c)
  await w.close()
  await reading
  return out
}

const concat = (parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(p => Array.from(p)))

describe('Studio framing', () => {
  test('plain payload is wrapped in SOF … EOF', () => {
    expect(Array.from(encodeFrame([1, 2, 3]))).toEqual([SOF, 1, 2, 3, EOF])
  })

  test('SOF, ESC and EOF bytes are escaped', () => {
    expect(Array.from(encodeFrame([0xab, 0x00, 0xac, 0xad]))).toEqual([SOF, ESC, 0xab, 0x00, ESC, 0xac, ESC, 0xad, EOF])
    expect(Array.from(encodeFrame([]))).toEqual([SOF, EOF])
  })

  test('decoder round-trips escapes across arbitrary chunk splits', () => {
    const payload = [0xad, 0xab, 0xac, 0xac, 0x10, 0xad]
    const frame = Array.from(encodeFrame(payload))
    for (let cut = 1; cut < frame.length; cut++) {
      const dec = new FrameDecoder()
      const got = [...dec.push(frame.slice(0, cut)), ...dec.push(frame.slice(cut))]
      expect(got.map(g => Array.from(g))).toEqual([payload])
    }
  })

  test('decoder drops noise outside frames and restarts on a stray SOF', () => {
    const dec = new FrameDecoder()
    const noise = Array.from(new TextEncoder().encode('*** Booting Zephyr ***\n'))
    const got = dec.push([...noise, SOF, 9, 9, SOF, 1, 2, EOF, 0x00, ...Array.from(encodeFrame([0xad]))])
    expect(got.map(g => Array.from(g))).toEqual([[1, 2], [0xad]])
  })

  test('FrameSync passes whole escaped frames only', () => {
    const s = new FrameSync()
    const f = Array.from(encodeFrame([0xab, 7]))
    expect(s.push([0x41, 0x42, ...f.slice(0, 3)])).toEqual([])
    expect(s.push(f.slice(3)).map(x => Array.from(x))).toEqual([f])
  })

  test('interop: our frames decode with the official client decoder and vice versa', async () => {
    const payloads = [[1, 2, 3], [0xab, 0xac, 0xad], [0xac], []]
    const decoded = await throughTransform(get_decoder(), payloads.map(p => encodeFrame(p)))
    expect(decoded.map(d => Array.from(d))).toEqual(payloads)

    const encodedChunks = await throughTransform(get_encoder(), payloads.map(p => Uint8Array.from(p)))
    const dec = new FrameDecoder()
    expect(dec.push(concat(encodedChunks)).map(d => Array.from(d))).toEqual(payloads)
    // The client emits many small chunks; the coalescer re-forms one buffer per frame.
    const co = new FrameCoalescer()
    const frames = encodedChunks.flatMap(c => co.push(c))
    expect(frames.map(f => Array.from(f))).toEqual(payloads.map(p => Array.from(encodeFrame(p))))
  })
})

// ── Fake Studio keyboard over a fake serial bridge ──────────────────────────

type Handler = (req: Request) => Omit<RequestResponse, 'requestId'> | null

function fakeBridge(handler: Handler, opts: { noise?: boolean; chunk?: number } = {}): SerialBridge & { writes: number } {
  let onData: ((b: Uint8Array) => void) | undefined
  let onClosed: ((e: string | null) => void) | undefined
  const dec = new FrameDecoder()
  const bridge = {
    id: 1,
    writes: 0,
    async write(bytes: Uint8Array) {
      bridge.writes++
      for (const payload of dec.push(bytes)) {
        const req = Request.decode(payload)
        const resp = handler(req)
        if (!resp) continue
        const body = Response.encode({ requestResponse: { requestId: req.requestId, ...resp } }).finish()
        let out = Array.from(encodeFrame(body))
        if (opts.noise) out = [0x0a, 0x21, ...out]
        const step = opts.chunk ?? out.length
        setTimeout(() => { for (let i = 0; i < out.length; i += step) onData?.(Uint8Array.from(out.slice(i, i + step))) }, 1)
      }
    },
    async close() { setTimeout(() => onClosed?.(null), 1) },
    onData(cb: (b: Uint8Array) => void) { onData = cb },
    onClosed(cb: (e: string | null) => void) { onClosed = cb },
  }
  return bridge
}

const HID = (usage: number, mods = 0) => ((mods << 24) | (0x07 << 16) | usage) >>> 0

const BEHAVIORS = {
  1: { displayName: 'Key Press', metadata: [{ param1: [{ name: 'Key', hidUsage: { keyboardMax: 0xff, consumerMax: 0xfff } }], param2: [] }] },
  2: { displayName: 'Layer-Tap', metadata: [{ param1: [{ name: 'Layer', layerId: {} }], param2: [{ name: 'Tap', hidUsage: { keyboardMax: 0xff, consumerMax: 0 } }] }] },
  3: { displayName: 'Transparent', metadata: [] },
  4: { displayName: 'Momentary Layer', metadata: [{ param1: [{ name: 'Layer', layerId: {} }], param2: [] }] },
  5: { displayName: 'Bluetooth', metadata: [{ param1: [{ name: 'Clear', constant: 0 }], param2: [] }, { param1: [{ name: 'Select', constant: 3 }], param2: [{ name: 'Profile', range: { min: 0, max: 4 } }] }] },
  6: { displayName: 'Mystery', metadata: [{ param1: [{ name: 'Wiggle', constant: 7 }], param2: [] }] },
} as const

interface KbState { locked: boolean; saved?: boolean; ignoreWrites?: boolean; layers?: ReturnType<typeof initialLayers> }

function initialLayers() {
  return [
    { id: 10, name: 'Base', bindings: [
      { behaviorId: 1, param1: HID(0x04), param2: 0 },
      { behaviorId: 2, param1: 11, param2: HID(0x2c) },
      { behaviorId: 1, param1: HID(0x1e, 0x02), param2: 0 },
    ] },
    { id: 11, name: '', bindings: [
      { behaviorId: 3, param1: 0, param2: 0 },
      { behaviorId: 5, param1: 3, param2: 2 },
      { behaviorId: 6, param1: 7, param2: 0 },
    ] },
  ]
}

function keyboard(state: KbState): Handler {
  const layers = (state.layers ??= initialLayers())
  return req => {
    if (req.core?.getDeviceInfo) return { core: { getDeviceInfo: { name: 'Corne TP', serialNumber: Uint8Array.from([0xde, 0xad]) } } }
    if (req.core?.getLockState) return { core: { getLockState: state.locked ? LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED : LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED } }
    if (state.locked && (req.keymap || req.behaviors)) return { meta: { simpleError: ErrorConditions.UNLOCK_REQUIRED } }
    if (req.keymap?.getPhysicalLayouts) {
      return {
        keymap: {
          getPhysicalLayouts: {
            activeLayoutIndex: 0,
            layouts: [{
              name: 'Default',
              keys: [
                { width: 100, height: 100, x: 0, y: 37, r: 0, rx: 0, ry: 0 },
                { width: 150, height: 100, x: 100, y: 0, r: 0, rx: 0, ry: 0 },
                { width: 100, height: 150, x: 400, y: 300, r: 1500, rx: 400, ry: 400 },
              ],
            }],
          },
        },
      }
    }
    if (req.keymap?.getKeymap) {
      return { keymap: { getKeymap: { availableLayers: 8, maxLayerNameLength: 20, layers: structuredClone(layers) } } }
    }
    if (req.keymap?.checkUnsavedChanges) return { keymap: { checkUnsavedChanges: false } }
    if (req.keymap?.setLayerBinding) {
      const { layerId, keyPosition, binding } = req.keymap.setLayerBinding
      if (keyPosition > 2) return { keymap: { setLayerBinding: 1 } }
      if (!state.ignoreWrites && binding) layers.find(l => l.id === layerId)!.bindings[keyPosition] = { ...binding }
      return { keymap: { setLayerBinding: 0 } }
    }
    if (req.keymap?.saveChanges) { state.saved = true; return { keymap: { saveChanges: { ok: true } } } }
    if (req.keymap?.discardChanges) return { keymap: { discardChanges: true } }
    if (req.behaviors?.listAllBehaviors) return { behaviors: { listAllBehaviors: { behaviors: Object.keys(BEHAVIORS).map(Number) } } }
    if (req.behaviors?.getBehaviorDetails) {
      const id = req.behaviors.getBehaviorDetails.behaviorId as keyof typeof BEHAVIORS
      const b = BEHAVIORS[id]
      return { behaviors: { getBehaviorDetails: { id, displayName: b.displayName, metadata: b.metadata as never } } }
    }
    return { meta: { simpleError: ErrorConditions.RPC_NOT_FOUND } }
  }
}

describe('Studio client over a fake keyboard', () => {
  test('reads name, layouts, layers and labelled bindings through noisy, split frames', async () => {
    const state = { locked: false }
    const bridge = fakeBridge(keyboard(state), { noise: true, chunk: 3 })
    const session = sessionFromTransport(bridgeTransport(bridge))
    const r = await readZmkStudio(session)
    expect(r.name).toBe('Corne TP')
    expect(r.serialNumber).toBe('dead')
    expect(r.lockState).toBe('unlocked')
    expect(r.layouts[0].keys).toEqual([
      { x: 0, y: 0.37 },
      { x: 1, y: 0, w: 1.5 },
      { x: 4, y: 3, h: 1.5, r: 15, rx: 4, ry: 4 },
    ])
    expect(r.layers.map(l => l.name)).toEqual(['Base', 'Layer 1'])
    const [a, lt, shifted] = r.layers[0].bindings
    expect(a).toMatchObject({ zmk: '&kp A', label: 'A' })
    expect(lt).toMatchObject({ zmk: '&lt 1 SPACE', label: 'SPC', sub: 'hold L1' })
    expect(shifted).toMatchObject({ zmk: '&kp LS(N1)', label: '⇧1' })
    const [trans, bt, mystery] = r.layers[1].bindings
    expect(trans).toMatchObject({ zmk: '&trans', label: '···' })
    expect(bt).toMatchObject({ zmk: '&bt BT_SEL 2', label: 'BT2' })
    expect(mystery.zmk).toBeUndefined()
    expect(mystery.label).toBe('Wiggle')
    expect(r.behaviors.find(b => b.id === 2)?.ref).toBe('&lt')
    // One IPC write per request frame, not one per encoder chunk.
    expect(bridge.writes).toBe(6 + Object.keys(BEHAVIORS).length)
    expect(state.saved).toBeUndefined()

    const before = await snapshotDevice({ kind: 'zmk-studio', session })
    await setBinding(session, 10, 0, { behaviorId: 1, param1: HID(0x05), param2: 0 })
    const after = await snapshotDevice({ kind: 'zmk-studio', session })
    expect(after.hash).not.toBe(before.hash)
    expect(after.studioLayers?.[0].bindings[0]).toEqual([1, HID(0x05), 0])
    await expect(setBinding(session, 10, 9, { behaviorId: 1, param1: 0, param2: 0 })).rejects.toThrow('invalid key position')
    await save(session)
    await discard(session)
    await session.close()
  })

  test('setBinding throws when the read-back differs', async () => {
    const session = sessionFromTransport(bridgeTransport(fakeBridge(keyboard({ locked: false, ignoreWrites: true }))))
    await expect(setBinding(session, 10, 0, { behaviorId: 1, param1: HID(0x05), param2: 0 })).rejects.toThrow('Read-back mismatch')
    await session.close()
  })

  test('locked keyboard → clear unlock message', async () => {
    const session = sessionFromTransport(bridgeTransport(fakeBridge(keyboard({ locked: true }))))
    const err = await readZmkStudio(session).catch(e => e)
    expect(err).toBeInstanceOf(StudioLockedError)
    expect(err.message).toBe('Keyboard is locked: press the Studio unlock key')
    await session.close()
  })

  test('silent port → "built without Studio" after the timeout', async () => {
    const session = sessionFromTransport(bridgeTransport(fakeBridge(() => null)))
    const err = await readZmkStudio(session).catch(e => e)
    expect(err.message).toBe(STUDIO_ERRORS.noStudio)
  }, 5000)

  test('getDeviceInfo honours a short timeout', async () => {
    const session = sessionFromTransport(bridgeTransport(fakeBridge(() => null)))
    const t0 = Date.now()
    await expect(getDeviceInfo(session, 100)).rejects.toThrow(STUDIO_ERRORS.timeout)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})

describe('Studio conversions', () => {
  test('describeBinding without behavior details falls back to the id', () => {
    expect(describeBinding({ behaviorId: 99, param1: 0, param2: 0 }, new Map()).label).toBe('#99')
  })

  test('mod-tap and momentary layer map to ZMK syntax', () => {
    const behaviors = new Map<number, StudioBehavior>([
      [1, { id: 1, displayName: 'Mod-Tap', ref: '&mt', details: { id: 1, displayName: 'Mod-Tap', metadata: [{ param1: [{ name: 'Hold', hidUsage: { keyboardMax: 255, consumerMax: 0 } }], param2: [{ name: 'Tap', hidUsage: { keyboardMax: 255, consumerMax: 0 } }] }] } }],
      [2, { id: 2, displayName: 'Momentary Layer', ref: '&mo', details: { id: 2, displayName: 'Momentary Layer', metadata: [{ param1: [{ name: 'Layer', layerId: {} }], param2: [] }] } }],
    ])
    expect(describeBinding({ behaviorId: 1, param1: HID(0xe1), param2: HID(0x04) }, behaviors)).toMatchObject({ zmk: '&mt LSHFT A', label: 'A', sub: 'hold SFT' })
    expect(describeBinding({ behaviorId: 2, param1: 7, param2: 0 }, behaviors, new Map([[7, 2]]))).toMatchObject({ zmk: '&mo 2', label: 'L2' })
  })

  test('studio layout uses centi-units and is normalised', () => {
    const l = studioLayoutToPhysical({ name: 'X', keys: [{ width: 100, height: 100, x: 50, y: 50, r: 0, rx: 0, ry: 0 }] })
    expect(l.keys).toEqual([{ x: 0, y: 0 }])
    expect(l.source).toBe('zmk-physical-layout')
  })
})
