import { describe, expect, test } from 'bun:test'
import { createNativeRemappingController, createNativeProfile, type NativeStatus } from '../src/lib/nativeRemapping'
import { diagnoseNative, runNativeFix, type NativeFixKind } from '../src/lib/nativeProblem'

const ok: NativeStatus = {
  state: 'stopped', message: 'Remapping is disabled; physical keyboards remain available.', driverReady: true,
  inputMonitoringGranted: true, helperInstalled: true, enabled: false, capturedDevices: 0, protocolVersion: 1,
}
const diagnose = (patch: Partial<NativeStatus> | null, extra: Partial<Parameters<typeof diagnoseNative>[0]> = {}) =>
  diagnoseNative({ available: true, status: patch && { ...ok, ...patch }, error: null, windows: false, hasRules: true, ...extra })

describe('problem -> fix mapping (Mac)', () => {
  test('nothing to fix: running, deliberately stopped, checking, or not the desktop app', () => {
    expect(diagnose({ state: 'running', enabled: true, capturedDevices: 1, message: 'Running.' })).toBeNull()
    expect(diagnose({ message: 'Remapping disabled; physical keyboards released.' })).toBeNull()
    expect(diagnose({ message: 'Helper stopped.' })).toBeNull()
    expect(diagnose({ driverReady: false })).toBeNull() // before the first Apply the driver connects on enable
    expect(diagnose(null)).toBeNull()
    expect(diagnose({}, { available: false })).toBeNull()
  })

  const cases: Array<[string, Partial<NativeStatus> | null, Parameters<typeof diagnoseNative>[0]['error'], string, NativeFixKind | null]> = [
    ['after wake', { message: 'Sleep or event-loop interruption detected; physical keyboards released. Enable again to resume.' }, null, 'released', 'enable'],
    ['after a dropped link', { message: 'Device disconnect, sleep, or driver loss detected; physical keyboards released. Enable again to resume.' }, null, 'released', 'enable'],
    ['app reconnects after an update', { message: 'The trusted app disconnected or console session changed; physical keyboards were released.' }, null, 'released', 'enable'],
    ['Input Monitoring lost', { state: 'needs_permission', inputMonitoringGranted: false, message: 'Grant Input Monitoring ...' }, null, 'permission', 'open_input_monitoring'],
    ['permission flag false while stopped', { inputMonitoringGranted: false }, null, 'permission', 'open_input_monitoring'],
    ['driver not approved after macOS update', { state: 'driver_unavailable', driverReady: false }, null, 'driver', 'approve_driver'],
    ['helper missing', { helperInstalled: false, state: 'not_installed' }, null, 'missing', 'install'],
    // What the Tauri layer reports for a down service: error, Input Monitoring false, helper installed.
    ['helper down after an update', { state: 'error', inputMonitoringGranted: false, driverReady: false, message: 'Connection refused (os error 61)' }, null, 'unreachable', 'check_again'],
    ['helper error', { state: 'error', message: 'Keyboard capture failed; all captured devices were released.' }, null, 'error', 'enable'],
    ['no built-in keyboard (lid closed)', { state: 'error', message: 'No supported built-in keyboard is available. External/split and unsupported mixed-input devices remain untouched.' }, null, 'error', 'enable'],
    ['helper unreachable', null, 'connection refused', 'unreachable', 'check_again'],
  ]
  for (const [name, patch, error, id, kind] of cases) {
    test(`${name} -> ${id}, one button: ${kind}`, () => {
      const problem = diagnose(patch, { error })
      expect(problem?.id).toBe(id)
      expect(problem?.fix?.kind).toBe(kind)
      expect(problem!.title.length).toBeGreaterThan(0)
      expect(problem!.title).not.toMatch(/karabiner/i)
    })
  }

  test('sleep and other release say what happened', () => {
    expect(diagnose({ message: 'Sleep or event-loop interruption detected; physical keyboards released. Enable again to resume.' })!.body).toContain('slept')
    expect(diagnose({ message: 'The trusted app disconnected or console session changed; physical keyboards were released.' })!.body).not.toContain('slept')
  })

  test('priority: missing helper beats permission beats driver beats stop', () => {
    expect(diagnose({ helperInstalled: false, inputMonitoringGranted: false, state: 'needs_permission' })?.id).toBe('missing')
    expect(diagnose({ inputMonitoringGranted: false, state: 'driver_unavailable' })?.id).toBe('permission')
    expect(diagnose({ state: 'driver_unavailable', message: 'x Enable again to resume.' })?.id).toBe('driver')
  })

  test('never offers Turn back on without rules or when it cannot apply', () => {
    const sleep = { message: 'Sleep or event-loop interruption detected; physical keyboards released. Enable again to resume.' }
    expect(diagnose(sleep, { hasRules: false })).toMatchObject({ id: 'released', fix: null })
  })

  test('an engine-stopped status never claims a button when the stop was yours', () => {
    expect(diagnose({ message: 'Remapping is disabled; physical keyboards remain available.' })).toBeNull()
  })
})

describe('problem -> fix mapping (Windows)', () => {
  const win = { windows: true }
  // The app appends this to every stopped or running Windows message.
  const note = ' Administrator windows (such as elevated PowerShell or Task Manager) keep normal keys.'
  test('no driver or permission steps; missing service has no false button', () => {
    expect(diagnose({ helperInstalled: false, state: 'not_installed' }, win)).toMatchObject({ id: 'missing', fix: null })
    expect(diagnose({ inputMonitoringGranted: false }, win)).toBeNull()
  })
  test('every message the service uses to let go shows the banner, with the app note appended', () => {
    const sleep = 'Your PC went to sleep, so remapping turned off. Turn it on again to keep going.' + note
    const locked = 'Your PC was locked or switched to another user, so remapping turned off. Turn it on again to keep going.' + note
    const stalled = 'The app stopped answering, so remapping was turned off. Your keyboard works as normal.' + note
    expect(diagnose({ message: sleep }, win)).toMatchObject({ id: 'released', fix: { kind: 'enable' } })
    expect(diagnose({ message: sleep }, win)!.body).toContain('slept')
    expect(diagnose({ message: locked }, win)).toMatchObject({ id: 'released', fix: { kind: 'enable' } })
    expect(diagnose({ message: stalled }, win)).toMatchObject({ id: 'released', fix: { kind: 'enable' } })
    expect(diagnose({ message: 'Windows is shutting down.' + note }, win)).toBeNull()
    expect(diagnose({ message: 'Remapping is disabled. Your keyboard works as normal.' + note }, win)).toBeNull()
  })
  test('a service in error restarts the service (the check-again command does the restart); an old Windows has no button', () => {
    const stuck = 'The keyboard service was stuck, so remapping turned off. Your keyboard works as normal.'
    expect(diagnose({ state: 'error', message: stuck }, win)).toMatchObject({ id: 'error', fix: { kind: 'check_again', label: 'Restart keyboard service' } })
    expect(diagnose({ state: 'driver_unavailable', message: 'Remapping needs Windows 10 version 22H2 or newer.' }, win))
      .toMatchObject({ id: 'error', fix: null })
  })
})

describe('each fix runs exactly one engine command', () => {
  const profile = createNativeProfile('Mine', [])
  const lastApplied = createNativeProfile('Running before sleep', [])
  const run = async (kind: NativeFixKind, appliedProfile = null as typeof profile | null) => {
    const calls: Array<[string, unknown]> = []
    const controller = createNativeRemappingController({ available: true, invoke: async <T,>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args])
      return (command === 'native_remapping_install' || command === 'native_remapping_activate_driver' ? 'ok' : command === 'native_remapping_open_settings' ? undefined : ok) as T
    } })
    await runNativeFix(kind, controller, profile, { appliedProfile })
    return calls
  }
  test('enable re-applies with enable on, preferring what was running', async () => {
    expect(await run('enable')).toEqual([['native_remapping_apply', { profile, enable: true }]])
    expect(await run('enable', lastApplied)).toEqual([['native_remapping_apply', { profile: lastApplied, enable: true }]])
  })
  test('the rest', async () => {
    expect(await run('install')).toEqual([['native_remapping_install', undefined]])
    expect(await run('approve_driver')).toEqual([['native_remapping_activate_driver', undefined]])
    expect(await run('open_input_monitoring')).toEqual([['native_remapping_open_settings', undefined]])
    expect(await run('check_again')).toEqual([['native_remapping_refresh_permissions', undefined]])
  })
})
