import { AlertTriangle } from 'lucide-react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { isWindows } from '@/lib/platform'
import { createNativeProfile, nativeRemapping, useNativeRemapping } from '@/lib/nativeRemapping'
import { diagnoseNative, FIX_BUSY, runNativeFix } from '@/lib/nativeProblem'

/** Names what stopped remapping in plain words, with the one button that fixes it. Shows on every tab; nothing when all is well. */
export default function NativeFixBanner() {
  const { rules, profileTitle } = useKarabinerStore()
  const snapshot = useNativeRemapping()
  const problem = diagnoseNative({
    available: snapshot.available, status: snapshot.status, error: snapshot.error,
    windows: isWindows(), hasRules: rules.length > 0,
  })
  if (!problem) return null
  const { fix } = problem
  const working = !!fix && snapshot.busy === FIX_BUSY[fix.kind]
  return (
    <div className="glass native-fix" role="status" aria-live="polite" data-problem={problem.id}>
      <AlertTriangle size={16} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0 }} />
      <div className="native-fix-text">
        <strong>{problem.title}</strong>
        <span>{problem.body}</span>
      </div>
      {fix && <button className="btn btn-primary btn-sm" disabled={!!snapshot.busy}
        onClick={() => { void runNativeFix(fix.kind, nativeRemapping, createNativeProfile(profileTitle, rules), snapshot).catch(() => {}) }}>
        {working ? fix.busyLabel : fix.label}
      </button>}
    </div>
  )
}
