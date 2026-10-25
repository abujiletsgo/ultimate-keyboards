import { useEffect, useState } from 'react'
import { Download, Play, Square, RefreshCw, Settings2 } from 'lucide-react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import {
  createNativeProfile, nativeCanApply, nativeIsRunning, nativeRemapping,
  serializeNativeProfile, useNativeRemapping,
} from '@/lib/nativeRemapping'

let lastObservedActive = false

/** Compact emergency control; tab changes only subscribe to status, never mutate capture. */
export function NativeEmergencyStop() {
  const { available, status, busy, error } = useNativeRemapping()
  const active = !!status && (status.enabled || status.capturedDevices > 0 || status.state === 'running')
  const [wasActive, setWasActive] = useState(active || lastObservedActive)
  useEffect(() => {
    if (active) { lastObservedActive = true; setWasActive(true) }
    else if (status && status.state !== 'error') { lastObservedActive = false; setWasActive(false) }
  }, [active, status])
  const uncertain = !status || status.state === 'error' || !!error
  if (!active && !(wasActive && uncertain)) return null
  return <>
    <span role="status" aria-live="polite" title={error ?? status?.message} style={{ fontSize: 11, color: uncertain ? 'var(--warning)' : 'var(--success)' }}>
      {uncertain ? 'Status uncertain · see Remapping' : status!.capturedDevices > 0 ? `Running · ${status!.capturedDevices} captured` : 'Remapping enabled'}
    </span>
    <button className="btn btn-danger btn-sm" disabled={!available || !!busy}
      onClick={() => { void nativeRemapping.disable().catch(() => {}) }}>
      <Square size={13} aria-hidden="true" />{busy === 'disable' ? 'Stopping…' : 'Stop remapping'}
    </button>
  </>
}

// Status changes announce without moving focus (WCAG 4.1.3); stable controls keep
// keyboard focus through setup/apply/stop (WCAG 2.4.7). Rendered QA is separate.
// https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
// https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
export default function NativeRemappingPanel() {
  const { rules, profileTitle, isDirty } = useKarabinerStore()
  const [saveError, setSaveError] = useState('')
  const { available, status, busy, error, notice, appliedProfile } = useNativeRemapping()
  const profile = createNativeProfile(profileTitle, rules)
  const running = nativeIsRunning(status)
  const matchesLastApply = appliedProfile !== null
    && serializeNativeProfile(profile) === serializeNativeProfile(appliedProfile)
  const stateLabel = !available ? 'Desktop app required'
    : busy === 'refresh' ? 'Checking permissions…'
    : !status ? (error ? 'Status unavailable' : 'Checking native service…')
    : running ? 'Running'
    : status.state === 'running' ? 'Waiting for keyboard'
    : ({ not_installed: 'Setup required', needs_permission: 'Permission required', driver_unavailable: 'Driver unavailable', stopped: 'Stopped', error: 'Needs attention' } as const)[status.state]

  const nextStep = !available
    ? 'Export your profile, then open Ultimate Keyboards on macOS to enable native remapping.'
    : !status ? 'Check the service status before applying rules.'
    : !status.helperInstalled ? 'Install the bundled keyboard service and driver, then complete the macOS approvals below.'
    : status.state === 'error' ? 'The keyboard service needs attention. Review its message below before retrying. Use Repair native components if its installation is incomplete.'
    : !status.inputMonitoringGranted ? 'Allow Ultimate Keyboards Remapper in System Settings › Privacy & Security › Input Monitoring, then choose Check status. Permission for Terminal or Ultimate Keyboards itself does not approve the remapper.'
    : status.state === 'driver_unavailable' ? 'Activate the keyboard driver and follow its approval instructions, then retry Apply and enable. The service will check the driver before capturing your keyboard.'
    : rules.length === 0 ? 'Add a rule or load an example in Keymap, then return here to apply it to the built-in keyboard.'
    : !status.driverReady ? 'Apply and enable to connect to the keyboard driver. The service will verify the driver before capturing your keyboard.'
    : running && matchesLastApply ? 'Your last applied rules are running. Edits take effect when you apply again.'
    : running ? 'Apply the configured rules to replace the live profile, or stop native remapping.'
    : 'Apply and enable these rules on the built-in keyboard.'

  // Action errors are retained by the shared controller; no transient-only toast.
  const run = (action: () => Promise<unknown>) => { void action().catch(() => {}) }
  const exportProfile = () => {
    const url = URL.createObjectURL(new Blob([serializeNativeProfile(profile)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'ultimate-keyboards-native.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const needsSetup = available && (!status || !status.helperInstalled || !status.inputMonitoringGranted || status.state === 'driver_unavailable' || status.state === 'error')

  return (
    <section aria-label="Native remapping" style={{ flexShrink: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <div role="status" aria-live="polite" aria-atomic="true" style={{ fontSize: 12, color: running ? 'var(--success)' : needsSetup ? 'var(--warning)' : 'var(--text-secondary)' }}>
          {stateLabel}{running ? ` · ${status!.capturedDevices} captured` : ''}
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" disabled={!available || !!busy || !nativeCanApply(status) || rules.length === 0}
          onClick={() => {
            setSaveError('')
            try {
              // Capture this exact draft; later edits never mutate the submitted profile.
              const submitted = createNativeProfile(profileTitle, structuredClone(rules))
              useKarabinerStore.getState().saveProfile()
              run(() => nativeRemapping.apply(submitted))
            } catch (error) { setSaveError(`Not applied: could not save the profile locally. ${error}`) }
          }} aria-describedby="native-next-step">
          <Play size={13} aria-hidden="true" />{busy === 'apply' ? 'Applying…' : running ? 'Apply current rules' : 'Apply and enable'}
        </button>
        <button className={`btn ${running ? 'btn-danger' : 'btn-secondary'} btn-sm`} disabled={!available || !!busy}
          onClick={() => run(nativeRemapping.disable)}>
          <Square size={13} aria-hidden="true" />{busy === 'disable' ? 'Stopping…' : 'Stop remapping'}
        </button>
      </div>
      <p id="native-next-step" style={{ fontSize: 11, lineHeight: 1.5, margin: '6px 0', color: needsSetup ? 'var(--text)' : 'var(--text-secondary)' }}>
        {nextStep}
      </p>
      <p style={{ fontSize: 11, lineHeight: 1.5, margin: '6px 0', color: 'var(--text-secondary)' }}>
        {isDirty ? 'Draft retained automatically. Save commits it locally; Revert restores the saved profile.' : 'Profile saved locally.'} Save never changes live remapping. Apply saves and enables the current profile.
      </p>
      {saveError && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>{saveError}</p>}
      <details open={needsSetup || undefined} className={needsSetup ? 'panel-inset' : undefined}
        style={{ padding: needsSetup ? '8px 12px' : 0, fontSize: 11 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>Native setup and profile</summary>
        <p style={{ marginTop: 8, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          Native remapping supports the built-in MacBook keyboard on macOS 13 or later (Apple silicon). The installer includes the keyboard service and standalone virtual keyboard driver; no separate Karabiner-Elements app or Terminal commands are needed for setup.
        </p>
        <p style={{ marginTop: 6, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          macOS may ask you to allow the bundled driver from Fumihiko Takayama (pqrs.org), then Input Monitoring for Ultimate Keyboards Remapper. Complete those approvals yourself, return here and choose Check status. Remapping starts only when you choose Apply and enable.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <button className="btn btn-secondary btn-sm" disabled={!available || !!busy || (!!status?.helperInstalled && status.driverReady)}
            onClick={() => run(nativeRemapping.install)} aria-describedby="native-next-step">
            <Download size={13} aria-hidden="true" />{busy === 'install' ? 'Opening installer…' : status?.helperInstalled ? 'Repair native components' : 'Install native components'}
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!available || !!busy || status?.helperInstalled === false} onClick={() => run(nativeRemapping.openSettings)}>
            <Settings2 size={13} aria-hidden="true" />Input Monitoring
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!available || !!busy || !status?.helperInstalled || status.driverReady}
            onClick={() => run(nativeRemapping.activateDriver)}>
            <Play size={13} aria-hidden="true" />{busy === 'activate' ? 'Requesting activation…' : 'Activate keyboard driver'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!available || !!busy || status?.helperInstalled === false} onClick={() => run(nativeRemapping.refreshPermissions)}>
            <RefreshCw size={13} aria-hidden="true" />{busy === 'refresh' ? 'Checking permissions…' : 'Check status'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportProfile}>
            <Download size={13} aria-hidden="true" />Export native profile
          </button>
        </div>
        <p style={{ marginTop: 8, lineHeight: 1.5, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
          {rules.length} rules · Combo {profile.comboWindowMs} ms · Home-row hold / layer fallback {profile.holdThresholdMs} ms · Tapless layers: immediate.
          {status?.profileTitle ? ` Live profile: ${status.profileTitle}.` : ''}
        </p>
        {status?.message && <p role="status" style={{ marginTop: 6, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{status.message}</p>}
        {available && <p style={{ marginTop: 6, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          Remapping stays active in the tray. Stop it here, or quit Ultimate Keyboards to release the keyboard.
        </p>}
      </details>
      <div role="alert" aria-atomic="true" style={{ fontSize: 12, color: 'var(--danger)', overflowWrap: 'anywhere', marginTop: error ? 8 : 0 }}>{error}</div>
      <div role="status" aria-atomic="true" style={{ fontSize: 12, overflowWrap: 'anywhere', marginTop: notice ? 8 : 0 }}>{notice}</div>
    </section>
  )
}
