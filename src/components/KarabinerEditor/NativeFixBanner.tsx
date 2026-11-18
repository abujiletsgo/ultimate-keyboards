import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { isWindows } from '@/lib/platform'
import { createNativeProfile, nativeRemapping, useNativeRemapping } from '@/lib/nativeRemapping'
import { diagnoseNative, FIX_BUSY, runNativeFix, type NativeFixKind, type NativeProblem } from '@/lib/nativeProblem'

/** Names what stopped remapping in plain words, with the one button that fixes it. Shows on every tab; nothing when all is well. */
export default function NativeFixBanner() {
  const { rules, profileTitle } = useKarabinerStore()
  const snapshot = useNativeRemapping()
  const [attempted, setAttempted] = useState(false)
  const held = useRef<NativeProblem | null>(null)
  const live = diagnoseNative({
    available: snapshot.available, status: snapshot.status, error: snapshot.error,
    windows: isWindows(), hasRules: rules.length > 0,
  })
  if (live) held.current = live
  // Keep the banner up while its fix runs (a fix clears the old error) and after it fails, so the reason is not lost.
  const fixing = !!held.current?.fix && snapshot.busy === FIX_BUSY[held.current.fix.kind]
  const failure = attempted && !snapshot.busy ? snapshot.error : null
  const problem = live ?? (fixing || failure ? held.current : null)
  const permission = problem?.id === 'permission'

  const run = (kind: NativeFixKind) => {
    setAttempted(true)
    void runNativeFix(kind, nativeRemapping, createNativeProfile(profileTitle, rules), snapshot).catch(() => {})
  }
  useEffect(() => {
    if (!live && !snapshot.busy && !snapshot.error) { held.current = null; setAttempted(false) }
  })
  // The helper only sees a new Input Monitoring grant after a restart, which Check again does: do it when you come back from Settings.
  useEffect(() => {
    if (!permission) return
    const back = () => { void nativeRemapping.refreshPermissions().catch(() => {}) }
    window.addEventListener('focus', back)
    return () => window.removeEventListener('focus', back)
  }, [permission])

  if (!problem) return null
  const { fix } = problem
  const working = !!fix && snapshot.busy === FIX_BUSY[fix.kind]
  return (
    <div className="glass native-fix" role="status" aria-live="polite" data-problem={problem.id}>
      <AlertTriangle size={16} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0 }} />
      <div className="native-fix-text">
        <strong>{problem.title}</strong>
        <span>{problem.body}</span>
        {failure && <span role="alert">That did not work: {failure}</span>}
      </div>
      {permission && <button className="btn btn-sm" disabled={!!snapshot.busy} onClick={() => run('check_again')}>
        {snapshot.busy === FIX_BUSY.check_again ? 'Checking…' : 'I turned it on'}
      </button>}
      {fix && <button className="btn btn-primary btn-sm" disabled={!!snapshot.busy} onClick={() => run(fix.kind)}>
        {working ? fix.busyLabel : fix.label}
      </button>}
    </div>
  )
}
