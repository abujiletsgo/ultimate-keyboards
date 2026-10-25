import { describe, expect, test } from 'bun:test'
import type { Rule } from '../src/lib/karabinerGenerator'
import {
  createNativeProfile, createNativeRemappingController, nativeCanApply,
  nativeIsRunning, serializeNativeProfile, type NativeStatus,
} from '../src/lib/nativeRemapping'

const ready: NativeStatus = {
  state: 'stopped', message: 'Ready', driverReady: true, inputMonitoringGranted: true,
  helperInstalled: true, enabled: false, capturedDevices: 0, protocolVersion: 1,
}
const running: NativeStatus = { ...ready, state: 'running', enabled: true, capturedDevices: 1, profileTitle: 'Test' }
const fixture: Rule[] = [
  { type: 'simple', description: 'A to B', fromKey: 'a', fromModifiers: ['control'], toKey: 'b', toModifiers: ['shift'] },
  { type: 'combo', description: 'Escape chord', fromKeys: ['j', 'k'], toKey: 'escape' },
  { type: 'layer_activator', description: 'Space layer', fromKey: 'spacebar', layerName: 'nav', tapKey: 'spacebar' },
  { type: 'layer_binding', description: 'Left', layerName: 'nav', fromKey: 'h', toKey: 'left_arrow' },
  { type: 'homerow_mod', description: 'A control', fromKey: 'a', tapKey: 'a', modKey: 'left_control' },
]

function invoker(handler: (command: string, args?: Record<string, unknown>) => unknown) {
  return async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => await handler(command, args) as T
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function scheduler() {
  let id = 0
  const pending = new Map<number, () => void>()
  return {
    pending,
    schedule: (callback: () => void, delay: number) => {
      expect(delay).toBe(3000)
      pending.set(++id, callback)
      return id as unknown as ReturnType<typeof setTimeout>
    },
    cancel: (timer: ReturnType<typeof setTimeout>) => { pending.delete(timer as unknown as number) },
    fire: () => {
      const first = pending.entries().next().value!
      pending.delete(first[0])
      first[1]()
    },
  }
}

describe('native profile contract', () => {
  test('all ordered rule types survive export without changing persisted editor objects', () => {
    const original = structuredClone(fixture)
    const profile = createNativeProfile('  Test  ', original)
    expect(JSON.parse(serializeNativeProfile(profile))).toEqual({
      version: 1, title: 'Test', rules: fixture, holdThresholdMs: 150, comboWindowMs: 50,
    })
    expect(profile.rules).not.toBe(original)
    if (profile.rules[0].type === 'simple') profile.rules[0].fromModifiers!.push('shift')
    if (profile.rules[1].type === 'combo') profile.rules[1].fromKeys.reverse()
    expect(original).toEqual(fixture)
    expect(createNativeProfile('  ', []).title).toBe('Ultimate Keyboards')
  })

  test('running needs confirmed readiness and captured devices; approval alone never means running', () => {
    expect(nativeIsRunning(running)).toBe(true)
    for (const patch of [{ enabled: false }, { driverReady: false }, { inputMonitoringGranted: false }, { helperInstalled: false }, { capturedDevices: 0 }]) {
      expect(nativeIsRunning({ ...running, ...patch })).toBe(false)
    }
    expect(nativeIsRunning(ready)).toBe(false)
    expect(nativeCanApply(ready)).toBe(true)
    expect(nativeCanApply({ ...ready, state: 'needs_permission' })).toBe(false)
    expect(nativeCanApply({ ...ready, inputMonitoringGranted: false })).toBe(false)
    expect(nativeCanApply({ ...ready, helperInstalled: false })).toBe(false)
    for (const state of ['stopped', 'driver_unavailable', 'error'] as const) {
      expect(nativeCanApply({ ...ready, state, driverReady: false })).toBe(true)
    }
    expect(nativeCanApply(null)).toBe(false)
  })
})

describe('native command lifecycle', () => {
  test('startup without a driver handshake stays stopped until explicit apply connects it', async () => {
    const calls: string[] = []
    const timer = scheduler()
    const controller = createNativeRemappingController({ available: true, ...timer, invoke: invoker(command => {
      calls.push(command)
      return command === 'native_remapping_apply' ? running : { ...ready, driverReady: false }
    }) })
    const stopHeartbeat = controller.startHeartbeat()
    await controller.refresh()
    expect(calls).toEqual(['native_remapping_status'])
    expect(nativeCanApply(controller.getSnapshot().status)).toBe(true)
    expect(nativeIsRunning(controller.getSnapshot().status)).toBe(false)
    expect(controller.getSnapshot().appliedProfile).toBeNull()
    await controller.apply(createNativeProfile('Test', fixture))
    expect(calls).toEqual(['native_remapping_status', 'native_remapping_apply'])
    expect(nativeIsRunning(controller.getSnapshot().status)).toBe(true)
    stopHeartbeat()
  })

  test('web profile export works without invoking or enabling a native service', async () => {
    let calls = 0
    const controller = createNativeRemappingController({ available: false, invoke: invoker(() => { calls++; return running }) })
    const stop = controller.startHeartbeat()
    await controller.refresh()
    await expect(controller.apply(createNativeProfile('Test', fixture))).rejects.toThrow('macOS desktop app')
    await expect(controller.refreshPermissions()).rejects.toThrow('macOS desktop app')
    stop()
    expect(calls).toBe(0)
    expect(controller.getSnapshot().status).toBeNull()
    expect(JSON.parse(serializeNativeProfile(createNativeProfile('Test', fixture))).rules).toEqual(fixture)
  })

  test('polls are coalesced and queued apply uses the clicked snapshot, not subsequent edits', async () => {
    const poll = deferred<NativeStatus>()
    const calls: string[] = []
    let submitted: unknown
    const controller = createNativeRemappingController({ available: true, invoke: invoker((command, args) => {
      calls.push(command)
      if (command === 'native_remapping_status') return poll.promise
      submitted = args
      return running
    }) })
    const first = controller.refresh()
    expect(controller.refresh()).toBe(first)
    const profile = createNativeProfile('Test', fixture)
    const apply = controller.apply(profile)
    profile.rules.splice(0)
    await expect(controller.disable()).rejects.toThrow('current native setup action')
    poll.resolve(ready)
    await first
    await apply
    expect(calls).toEqual(['native_remapping_status', 'native_remapping_apply'])
    expect(submitted).toEqual({ profile: createNativeProfile('Test', fixture), enable: true })
    expect(controller.getSnapshot().status).toEqual(running)
    expect(controller.getSnapshot().appliedProfile?.rules).toEqual(fixture)
    expect(controller.getSnapshot().busy).toBeNull()
  })

  test('failed apply leaves saved rules alone, and failed status clears stale running evidence', async () => {
    let failPoll = false
    const controller = createNativeRemappingController({ available: true, invoke: invoker(command => {
      if (command === 'native_remapping_apply') throw new Error('Input Monitoring permission required')
      if (failPoll) throw new Error('Helper disconnected')
      return running
    }) })
    const profile = createNativeProfile('Test', fixture)
    await controller.refresh()
    await expect(controller.apply(profile)).rejects.toThrow('Input Monitoring')
    expect(profile.rules).toEqual(fixture)
    expect(controller.getSnapshot().appliedProfile).toBeNull()
    expect(controller.getSnapshot().error).toContain('Input Monitoring')
    failPoll = true
    await controller.refresh()
    expect(controller.getSnapshot().status).toBeNull()
    failPoll = false
    await controller.refresh()
    expect(controller.getSnapshot().error).toBeNull()
  })

  test('unexpected protocol is not presented as active', async () => {
    const controller = createNativeRemappingController({ available: true, invoke: invoker(() => ({ ...running, protocolVersion: 2 })) })
    await controller.refresh()
    expect(controller.getSnapshot().status).toBeNull()
    expect(controller.getSnapshot().error).toContain('unsupported status')
  })

  test('a nullable Rust profile title is accepted without inventing an applied profile', async () => {
    const controller = createNativeRemappingController({ available: true, invoke: invoker(() => ({ ...ready, profileTitle: null })) })
    await controller.refresh()
    expect(controller.getSnapshot().status?.state).toBe('stopped')
    expect(controller.getSnapshot().appliedProfile).toBeNull()
    expect(controller.getSnapshot().error).toBeNull()
  })

  test('stop calls only disable and retains the last submitted profile for comparison', async () => {
    const calls: string[] = []
    const controller = createNativeRemappingController({ available: true, invoke: invoker(command => {
      calls.push(command)
      return command === 'native_remapping_apply' ? running : ready
    }) })
    await controller.apply(createNativeProfile('Test', fixture))
    await controller.disable()
    expect(calls).toEqual(['native_remapping_apply', 'native_remapping_disable'])
    expect(nativeIsRunning(controller.getSnapshot().status)).toBe(false)
    expect(controller.getSnapshot().appliedProfile?.rules).toEqual(fixture)
  })

  test('driver activation is explicit and retains approval guidance without enabling rules', async () => {
    const calls: string[] = []
    const controller = createNativeRemappingController({ available: true, invoke: invoker(command => {
      calls.push(command)
      return 'Approve the driver in System Settings.'
    }) })
    await controller.activateDriver()
    expect(calls).toEqual(['native_remapping_activate_driver'])
    expect(controller.getSnapshot().notice).toContain('Approve the driver')
    expect(controller.getSnapshot().status).toBeNull()
    expect(controller.getSnapshot().appliedProfile).toBeNull()
  })

  test('permission refresh is explicit, updates status, and never enables capture; heartbeat stays read-only', async () => {
    const timer = scheduler()
    const calls: string[] = []
    let granted = false
    const stopped = { ...ready, driverReady: false }
    const controller = createNativeRemappingController({ available: true, ...timer, invoke: invoker(command => {
      calls.push(command)
      if (command === 'native_remapping_refresh_permissions') granted = true
      return granted ? stopped : { ...stopped, state: 'needs_permission', inputMonitoringGranted: false }
    }) })
    const stop = controller.startHeartbeat()
    await controller.refresh()
    expect(controller.getSnapshot().status?.inputMonitoringGranted).toBe(false)
    await controller.refreshPermissions()
    expect(controller.getSnapshot().status).toEqual(stopped)
    expect(controller.getSnapshot().status?.enabled).toBe(false)
    expect(controller.getSnapshot().status?.capturedDevices).toBe(0)
    expect(controller.getSnapshot().appliedProfile).toBeNull()
    timer.fire()
    await controller.refresh()
    expect(calls).toEqual(['native_remapping_status', 'native_remapping_refresh_permissions', 'native_remapping_status'])
    stop()
  })

  test('permission refresh waits for an in-flight poll and excludes concurrent actions and polls', async () => {
    const poll = deferred<NativeStatus>()
    const permission = deferred<NativeStatus>()
    const calls: string[] = []
    const controller = createNativeRemappingController({ available: true, invoke: invoker(command => {
      calls.push(command)
      return command === 'native_remapping_status' ? poll.promise : permission.promise
    }) })
    const pendingPoll = controller.refresh()
    const pendingRefresh = controller.refreshPermissions()
    expect(controller.getSnapshot().busy).toBe('refresh')
    await expect(controller.refreshPermissions()).rejects.toThrow('current native setup action')
    await expect(controller.apply(createNativeProfile('Test', fixture))).rejects.toThrow('current native setup action')
    await controller.refresh()
    expect(calls).toEqual(['native_remapping_status'])
    poll.resolve({ ...ready, state: 'needs_permission', inputMonitoringGranted: false })
    await pendingPoll
    permission.resolve({ ...ready, driverReady: false })
    await pendingRefresh
    expect(calls).toEqual(['native_remapping_status', 'native_remapping_refresh_permissions'])
    expect(controller.getSnapshot().status?.inputMonitoringGranted).toBe(true)
    expect(controller.getSnapshot().busy).toBeNull()
    expect(controller.getSnapshot().appliedProfile).toBeNull()
  })

  test('permission refresh rejects invalid status and backend failure without retaining stale running evidence', async () => {
    for (const failure of [new Error('Could not refresh helper permissions'), { ...running, protocolVersion: 2 }]) {
      const controller = createNativeRemappingController({ available: true, invoke: invoker(command => {
        if (command !== 'native_remapping_refresh_permissions') return running
        if (failure instanceof Error) throw failure
        return failure
      }) })
      await controller.apply(createNativeProfile('Test', fixture))
      expect(nativeIsRunning(controller.getSnapshot().status)).toBe(true)
      await expect(controller.refreshPermissions()).rejects.toThrow(failure instanceof Error ? 'Could not refresh' : 'unsupported status')
      expect(controller.getSnapshot().status).toBeNull()
      expect(controller.getSnapshot().appliedProfile).toBeNull()
      expect(controller.getSnapshot().error).toBeTruthy()
      expect(controller.getSnapshot().busy).toBeNull()
    }
  })

  test('heartbeat renews status only and cleanup cancels future renewals', async () => {
    const timer = scheduler()
    const calls: string[] = []
    const controller = createNativeRemappingController({ available: true, ...timer, invoke: invoker(command => { calls.push(command); return ready }) })
    const stop = controller.startHeartbeat()
    await controller.refresh()
    expect(timer.pending.size).toBe(1)
    timer.fire()
    await controller.refresh()
    expect(calls).toEqual(['native_remapping_status', 'native_remapping_status'])
    stop()
    expect(timer.pending.size).toBe(0)
  })

  test('cleanup during an in-flight heartbeat does not schedule another lease renewal', async () => {
    const timer = scheduler()
    const poll = deferred<NativeStatus>()
    const controller = createNativeRemappingController({ available: true, ...timer, invoke: invoker(() => poll.promise) })
    const stop = controller.startHeartbeat()
    const pending = controller.refresh()
    stop()
    poll.resolve(ready)
    await pending
    expect(timer.pending.size).toBe(0)
  })
})
