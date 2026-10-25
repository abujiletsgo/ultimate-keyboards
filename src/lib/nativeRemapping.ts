import { useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from './io'
import { HOMEROW_HOLD_MS, type Rule } from './karabinerGenerator'

export interface NativeProfile {
  version: 1
  title: string
  rules: Rule[]
  holdThresholdMs: number
  comboWindowMs: number
}

export interface NativeStatus {
  state: 'not_installed' | 'needs_permission' | 'driver_unavailable' | 'stopped' | 'running' | 'error'
  message: string
  driverReady: boolean
  inputMonitoringGranted: boolean
  helperInstalled: boolean
  enabled: boolean
  capturedDevices: number
  profileTitle?: string | null
  protocolVersion: 1
}

export function createNativeProfile(title: string, rules: readonly Rule[]): NativeProfile {
  return {
    version: 1,
    title: title.trim() || 'Ultimate Keyboards',
    rules: structuredClone([...rules]),
    holdThresholdMs: HOMEROW_HOLD_MS,
    comboWindowMs: 50,
  }
}

export function serializeNativeProfile(profile: NativeProfile): string {
  return JSON.stringify(profile, null, 2)
}

export function nativeIsRunning(status: NativeStatus | null): boolean {
  return !!status && status.state === 'running' && status.enabled && status.helperInstalled
    && status.driverReady && status.inputMonitoringGranted && status.capturedDevices > 0
}

export function nativeCanApply(status: NativeStatus | null): boolean {
  // Readiness is established by explicit Apply; the service verifies it before
  // seizing input. Requiring it here would prevent the initial handshake.
  return !!status && status.helperInstalled && status.inputMonitoringGranted
    && (status.state === 'stopped' || status.state === 'running'
      || status.state === 'driver_unavailable' || status.state === 'error')
}

export interface NativeRemappingSnapshot {
  available: boolean
  status: NativeStatus | null
  busy: 'refresh' | 'apply' | 'disable' | 'install' | 'activate' | 'settings' | null
  error: string | null
  notice: string | null
  /** Session-local evidence of what this UI successfully submitted, not a service checksum. */
  appliedProfile: NativeProfile | null
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>
type Timer = number | ReturnType<typeof setTimeout>
interface Dependencies {
  available: boolean
  invoke: Invoke
  schedule?: (callback: () => void, delay: number) => Timer
  cancel?: (timer: Timer) => void
}

function checkedStatus(value: NativeStatus): NativeStatus {
  const states = ['not_installed', 'needs_permission', 'driver_unavailable', 'stopped', 'running', 'error']
  if (!value || value.protocolVersion !== 1 || !states.includes(value.state)
    || typeof value.message !== 'string' || typeof value.driverReady !== 'boolean'
    || typeof value.helperInstalled !== 'boolean' || typeof value.enabled !== 'boolean'
    || typeof value.inputMonitoringGranted !== 'boolean' || !Number.isInteger(value.capturedDevices)
    || value.capturedDevices < 0 || (value.profileTitle != null && typeof value.profileTitle !== 'string')) {
    throw new Error('The native service returned an unsupported status. Reopen the app after updating its helper.')
  }
  return value
}

/** One command lane prevents stale polls overwriting apply/stop results. No command auto-enables input. */
export function createNativeRemappingController(deps: Dependencies) {
  let snapshot: NativeRemappingSnapshot = {
    available: deps.available, status: null, busy: null, error: null, notice: null, appliedProfile: null,
  }
  const listeners = new Set<() => void>()
  const update = (patch: Partial<NativeRemappingSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of listeners) listener()
  }
  let tail: Promise<unknown> = Promise.resolve()
  const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation)
    tail = next.catch(() => {})
    return next
  }
  let polling: Promise<void> | null = null
  let lastPollError: string | null = null
  const refresh = (): Promise<void> => {
    if (!deps.available || snapshot.busy) return Promise.resolve()
    if (polling) return polling
    polling = enqueue(async () => {
      try {
        const status = checkedStatus(await deps.invoke<NativeStatus>('native_remapping_status'))
        update({ status, ...(lastPollError !== null && snapshot.error === lastPollError ? { error: null } : {}) })
        lastPollError = null
      } catch (error) {
        // An old running state is not evidence that the helper is still reachable.
        lastPollError = String(error)
        update({ status: null, appliedProfile: null, error: lastPollError })
      }
    }).finally(() => { polling = null })
    return polling
  }
  const act = async <T,>(busy: NonNullable<NativeRemappingSnapshot['busy']>, operation: () => Promise<T>): Promise<T> => {
    if (!deps.available) throw new Error('Native remapping requires the macOS desktop app. You can export this profile here.')
    if (snapshot.busy) throw new Error('Wait for the current native setup action to finish.')
    update({ busy, error: null, notice: null })
    try {
      return await enqueue(operation)
    } catch (error) {
      update({ error: String(error) })
      throw error
    } finally {
      update({ busy: null })
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh,
    // Explicit permission reconciliation may restart our helper. Never call this
    // from the heartbeat: ordinary status polling remains side-effect free.
    refreshPermissions: () => act('refresh', async () => {
      try {
        const status = checkedStatus(await deps.invoke<NativeStatus>('native_remapping_refresh_permissions'))
        lastPollError = null
        update({ status, error: null })
        return status
      } catch (error) {
        // A failed reconciliation may follow a helper restart; do not retain
        // stale evidence of a running capture or successfully applied profile.
        update({ status: null, appliedProfile: null })
        throw error
      }
    }),
    apply: (profile: NativeProfile) => {
      // Capture before any async work: edits during application belong to the next apply.
      const submitted = structuredClone(profile)
      return act('apply', async () => {
        const status = checkedStatus(await deps.invoke<NativeStatus>('native_remapping_apply', { profile: submitted, enable: true }))
        update({ status, appliedProfile: submitted })
        return status
      })
    },
    disable: () => act('disable', async () => {
      const status = checkedStatus(await deps.invoke<NativeStatus>('native_remapping_disable'))
      update({ status })
      return status
    }),
    install: () => act('install', async () => {
      const notice = await deps.invoke<string>('native_remapping_install')
      update({ notice })
      return notice
    }),
    activateDriver: () => act('activate', async () => {
      const notice = await deps.invoke<string>('native_remapping_activate_driver')
      update({ notice })
      return notice
    }),
    openSettings: () => act('settings', () => deps.invoke<void>('native_remapping_open_settings')),
    /** App-level lease, deliberately independent of editor visibility. Cleanup never renews it. */
    startHeartbeat: () => {
      if (!deps.available) return () => {}
      let active = true
      let timer: Timer | undefined
      const schedule = deps.schedule ?? setTimeout
      const cancel = deps.cancel ?? clearTimeout
      const tick = async () => {
        await refresh()
        if (active) timer = schedule(() => { void tick() }, 3000)
      }
      void tick()
      return () => {
        active = false
        if (timer !== undefined) cancel(timer)
      }
    },
  }
}

export const nativeRemapping = createNativeRemappingController({ available: IS_TAURI, invoke })

export function useNativeRemapping() {
  return useSyncExternalStore(nativeRemapping.subscribe, nativeRemapping.getSnapshot, nativeRemapping.getSnapshot)
}
