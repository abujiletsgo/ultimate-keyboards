import { nativeCanApply, type NativeProfile, type NativeRemappingSnapshot, type NativeStatus } from './nativeRemapping'

/**
 * What the app can really do about a stopped or broken remapper. Each kind maps to exactly one
 * existing engine command in `runNativeFix`; a problem with no honest one-tap fix carries `fix: null`
 * and says what to do instead.
 */
export type NativeFixKind = 'enable' | 'install' | 'approve_driver' | 'open_input_monitoring' | 'check_again'

export interface NativeProblem {
  id: 'unreachable' | 'missing' | 'permission' | 'driver' | 'error' | 'released'
  title: string
  body: string
  fix: { kind: NativeFixKind; label: string; busyLabel: string } | null
}

interface Input {
  available: boolean
  status: NativeStatus | null
  /** A failed status poll or action; with no status it means the helper cannot be reached. */
  error: string | null
  windows: boolean
  /** Whether there is a profile with rules to turn back on. */
  hasRules: boolean
}

/** Stops the helper reports when it let go of the keyboard by itself (wake, stall, lost link), not when you pressed Stop. */
function releasedByItself(message: string): 'sleep' | 'other' | null {
  if (message.endsWith('Enable again to resume.')) return /sleep/i.test(message) ? 'sleep' : 'other'
  if (message.endsWith('physical keyboards were released.')) return 'other'
  return null
}

/**
 * The one thing that is wrong right now, in plain words, with the one button that fixes it.
 * Null when nothing needs attention: running, deliberately stopped, still checking, or not the desktop app.
 * Order matters: a missing helper outranks a missing permission, which outranks a stopped engine.
 */
export function diagnoseNative({ available, status, error, windows, hasRules }: Input): NativeProblem | null {
  if (!available) return null
  const pc = windows ? 'PC' : 'Mac'
  if (!status) {
    return error ? {
      id: 'unreachable',
      title: 'The keyboard helper is not answering',
      body: `Your keys work as normal. This can happen after a restart or an update. Check again to reconnect.`,
      fix: { kind: 'check_again', label: 'Check again', busyLabel: 'Checking…' },
    } : null
  }
  if (!status.helperInstalled) {
    return {
      id: 'missing',
      title: 'The keyboard helper is missing',
      body: windows
        ? 'This copy of the app has lost its keyboard service. Reinstall the app to get it back.'
        : `An update or a cleanup may have removed it. Your keys work as normal until it is back.`,
      fix: windows ? null : { kind: 'install', label: 'Install keyboard helper', busyLabel: 'Opening installer…' },
    }
  }
  if (!windows && (status.state === 'needs_permission' || !status.inputMonitoringGranted)) {
    return {
      id: 'permission',
      title: 'Input Monitoring is switched off',
      body: `macOS needs you to turn on Ultimate Keyboards Remapper there. An update can switch it off. Your keys work as normal until then.`,
      fix: { kind: 'open_input_monitoring', label: 'Open Input Monitoring settings', busyLabel: 'Opening…' },
    }
  }
  if (!windows && status.state === 'driver_unavailable') {
    return {
      id: 'driver',
      title: 'The keyboard driver needs your OK',
      body: `macOS may ask you to approve the driver again after an update. Your keys work as normal until you do.`,
      fix: { kind: 'approve_driver', label: 'Approve keyboard driver', busyLabel: 'Asking macOS…' },
    }
  }
  if (status.state === 'error' || (windows && status.state === 'driver_unavailable')) {
    return {
      id: 'error',
      title: 'The keyboard helper ran into a problem',
      body: `Your keys work as normal. ${status.message}`.trim(),
      fix: windows
        ? { kind: 'install', label: 'Restart keyboard service', busyLabel: 'Starting…' }
        : { kind: 'install', label: 'Repair keyboard helper', busyLabel: 'Opening installer…' },
    }
  }
  const released = status.state === 'stopped' && !status.enabled ? releasedByItself(status.message) : null
  if (released) {
    return {
      id: 'released',
      title: 'Remapping turned itself off',
      body: released === 'sleep'
        ? `Your ${pc} slept or the keyboard link dropped, so your keys went back to normal.`
        : `Your ${pc} let go of the keyboard, so your keys went back to normal.`,
      fix: hasRules && nativeCanApply(status)
        ? { kind: 'enable', label: 'Turn remapping back on', busyLabel: 'Turning on…' }
        : null,
    }
  }
  return null
}

type Controller = {
  apply: (profile: NativeProfile) => Promise<unknown>
  install: () => Promise<unknown>
  activateDriver: () => Promise<unknown>
  openSettings: () => Promise<unknown>
  refreshPermissions: () => Promise<unknown>
}

/** The single engine command behind each fix. Enable re-applies the profile that was running, else the saved one. */
export function runNativeFix(
  kind: NativeFixKind, controller: Controller, profile: NativeProfile, snapshot: Pick<NativeRemappingSnapshot, 'appliedProfile'>,
): Promise<unknown> {
  switch (kind) {
    case 'enable': return controller.apply(snapshot.appliedProfile ?? profile)
    case 'install': return controller.install()
    case 'approve_driver': return controller.activateDriver()
    case 'open_input_monitoring': return controller.openSettings()
    case 'check_again': return controller.refreshPermissions()
  }
}

/** Which busy flag the controller shows while this fix runs, so the button label can follow it. */
export const FIX_BUSY: Record<NativeFixKind, NonNullable<NativeRemappingSnapshot['busy']>> = {
  enable: 'apply', install: 'install', approve_driver: 'activate', open_input_monitoring: 'settings', check_again: 'refresh',
}
