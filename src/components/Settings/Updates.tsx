/**
 * Settings › Updates. Checks GitHub Releases through tauri-plugin-updater;
 * the download is verified against the release signing key compiled into the
 * app before it is installed. The check runs when this page opens and on
 * the button; nothing is downloaded without the user's click.
 */
import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { IS_TAURI } from '@/lib/io'
import { isAnyDirty as hasUnsavedChanges } from '@/lib/dirty'
import { ErrorPanel } from '@/components/ui'

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'none' }
  | { kind: 'available'; update: Update }
  | { kind: 'downloading'; done: number; total: number | null }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

function friendly(e: unknown): string {
  const s = String(e)
  if (/pubkey|public key|signature/i.test(s)) return `This build has no valid update signing key, so updates cannot be verified. (${s})`
  if (/404|not found|Could not fetch a valid release JSON/i.test(s)) return 'No published release was found on GitHub yet.'
  if (/network|dns|connect|offline|timed out/i.test(s)) return `Could not reach GitHub. Check your connection. (${s})`
  return s
}

export default function Updates() {
  const [state, setState] = useState<State>({ kind: 'idle' })

  const run = async () => {
    setState({ kind: 'checking' })
    try {
      const u = await check()
      setState(u ? { kind: 'available', update: u } : { kind: 'current' })
    } catch (e) {
      // no release published yet is a normal state, not an error
      if (/404|not found|Could not fetch a valid release JSON/i.test(String(e))) setState({ kind: 'none' })
      else setState({ kind: 'error', message: friendly(e) })
    }
  }

  const install = async (u: Update) => {
    let done = 0, total: number | null = null
    setState({ kind: 'downloading', done, total })
    try {
      await u.downloadAndInstall(ev => {
        if (ev.event === 'Started') total = ev.data.contentLength ?? null
        else if (ev.event === 'Progress') done += ev.data.chunkLength
        setState({ kind: 'downloading', done, total })
      })
      setState({ kind: 'ready' })
    } catch (e) { setState({ kind: 'error', message: friendly(e) }) }
  }

  useEffect(() => { if (IS_TAURI) run() }, [])

  if (!IS_TAURI) return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Updates are available in the desktop app.</p>

  const pct = state.kind === 'downloading' && state.total ? Math.round((state.done / state.total) * 100) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>Installed version <strong className="mono">{__APP_VERSION__}</strong></span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={run} disabled={state.kind === 'checking' || state.kind === 'downloading'}>
          {state.kind === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {state.kind === 'current' && <span style={{ color: 'var(--success)' }}>You have the latest version.</span>}
        {state.kind === 'none' && <span style={{ color: 'var(--text-muted)' }}>No release has been published yet. This is the newest build.</span>}
        {state.kind === 'available' && (
          <div className="panel-inset" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div><strong>Version {state.update.version}</strong> is available{state.update.date ? ` (${state.update.date.slice(0, 10)})` : ''}.</div>
            {state.update.body && <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: 12, maxHeight: 160, overflow: 'auto' }}>{state.update.body}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>This build is not signed by Apple yet, so macOS asks again for Documents and Accessibility access after the update.</div>
            <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => install(state.update)}>Download and install</button>
          </div>
        )}
        {state.kind === 'downloading' && <span>Downloading{pct !== null ? ` ${pct}%` : '…'}</span>}
        {state.kind === 'ready' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--success)' }}>Installed. Restart to use the new version.</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => relaunch()}
              disabled={hasUnsavedChanges()}
              title={hasUnsavedChanges() ? 'Save or discard your unsaved changes first' : undefined}
            >Restart now</button>
          </div>
        )}
        {state.kind === 'error' && <ErrorPanel onRetry={run}>{state.message}</ErrorPanel>}
      </div>
    </div>
  )
}
