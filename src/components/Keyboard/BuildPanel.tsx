/**
 * Build tab: what changed in the config repo, the latest GitHub Actions runs
 * (through the user's own `gh` login), artifact download into
 * <repo>/firmware/, and an explicit per-half Flash step. No push, no tokens.
 */
import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { RefreshCw, Download, Zap, ExternalLink } from 'lucide-react'
import { IS_TAURI } from '@/lib/io'
import { useToast } from '@/components/ui'
import { openGithub } from '@/lib/openUrl'
import type { KeyboardDef } from '@/lib/registry/types'

interface RepoStatus { branch: string; ahead: number; behind: number; changes: string[]; remote: string | null; github: string | null }
interface GhInfo { available: boolean; logged_in: boolean; detail: string }
interface Run { databaseId: number; status: string; conclusion: string | null; displayTitle: string; createdAt: string; updatedAt: string; headSha: string; url: string }

export default function BuildPanel({ keyboard }: { keyboard: KeyboardDef }) {
  const toast = useToast()
  const repo = keyboard.repoPath
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [gh, setGh] = useState<GhInfo | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [firmware, setFirmware] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flashing, setFlashing] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!IS_TAURI || !repo) return
    setError(null); setBusy('refresh')
    try {
      const st = await invoke<RepoStatus>('git_repo_status', { repo })
      setStatus(st)
      setDiff(await invoke<string>('git_diff_file', { repo, path: keyboard.keymapPath }).catch(e => `Could not read the diff: ${e}`))
      setFirmware(await invoke<string[]>('list_firmware', { repo }))
      const info = await invoke<GhInfo>('gh_info')
      setGh(info)
      if (info.available && info.logged_in && st.github) {
        const json = await invoke<string>('gh_run_list', { repo, branch: st.branch, limit: 5 })
        setRuns(JSON.parse(json) as Run[])
      } else setRuns([])
    } catch (e) {
      setError(String(e)); setRuns([])
    } finally { setBusy(b => (b === 'refresh' ? null : b)) }
  }, [repo, keyboard.keymapPath])

  useEffect(() => { refresh() }, [refresh])

  if (!IS_TAURI) return <div className="panel-inset" style={{ padding: 14, fontSize: 12, color: 'var(--text-secondary)' }}>Build status, artifact download and flashing need the desktop app.</div>
  if (!repo) return <div className="panel-inset" style={{ padding: 14, fontSize: 12, color: 'var(--text-secondary)' }}>This keyboard has no config folder. Open Settings › Keyboards › Edit › Files and choose its config folder.</div>

  const download = async (run: Run) => {
    setBusy(`download-${run.databaseId}`)
    try {
      const files = await invoke<string[]>('gh_run_download', { repo, runId: run.databaseId })
      setFirmware(await invoke<string[]>('list_firmware', { repo }))
      toast.success(files.length ? `Downloaded ${files.length} uf2 file${files.length === 1 ? '' : 's'} into firmware/` : 'Run had no uf2 artifacts')
    } catch (e) { toast.error(`Download failed: ${e}`) } finally { setBusy(null) }
  }

  const flash = async (path: string) => {
    setFlashing(path)
    try {
      const msg = await invoke<string>('flash_uf2', { path, timeoutSecs: 120 })
      toast.success(`Flashed: ${msg}`)
    } catch (e) { toast.error(String(e)) } finally { setFlashing(null) }
  }

  const stateLabel = (r: Run) => r.status !== 'completed' ? r.status.replace('_', ' ') : (r.conclusion ?? 'done')
  const stateColor = (r: Run) => r.status !== 'completed' ? 'var(--warning)' : r.conclusion === 'success' ? 'var(--success)' : 'var(--danger)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Build</h3>
        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={busy === 'refresh'}><RefreshCw size={13} /> {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {error && <div className="panel-inset error-panel" role="alert">{error}</div>}

      {/* Repo state */}
      <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Config repo</div>
        {status ? (
          <>
            <div style={{ fontSize: 12 }}>
              <span className="mono">{repo}</span> · branch <strong>{status.branch}</strong>
              {status.ahead > 0 && <span className="tag" style={{ marginLeft: 6 }}>{status.ahead} unpushed</span>}
              {status.behind > 0 && <span className="tag" style={{ marginLeft: 6 }}>{status.behind} behind</span>}
              {status.github && <button className="btn-link" onClick={() => openGithub(`https://github.com/${status.github}`).catch(e => toast.error(String(e)))} style={{ marginLeft: 8, fontSize: 11 }}>{status.github} <ExternalLink size={10} /></button>}
            </div>
            {status.changes.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--success)' }}>Working tree clean — everything is committed.</div>
            ) : (
              <div style={{ fontSize: 12 }}>
                <div style={{ color: 'var(--warning)', marginBottom: 4 }}>{status.changes.length} uncommitted change{status.changes.length === 1 ? '' : 's'}:</div>
                <pre className="mono" style={{ margin: 0, fontSize: 11, maxHeight: 120, overflow: 'auto' }}>{status.changes.join('\n')}</pre>
              </div>
            )}
            {diff && diff.trim() && (
              <details>
                <summary style={{ fontSize: 12, cursor: 'pointer' }}>Keymap diff vs last commit</summary>
                <pre className="mono" style={{ margin: '6px 0 0', fontSize: 11, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre' }}>{diff}</pre>
              </details>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Commit and push from your terminal or Git client; GitHub Actions builds the firmware. This app never pushes.
            </div>
          </>
        ) : <div className="skeleton" style={{ height: 40 }} />}
      </section>

      {/* Runs */}
      <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>GitHub Actions</div>
        {gh && !gh.available && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The <code className="mono">gh</code> CLI is not installed. <code className="mono">brew install gh && gh auth login</code> enables run status and artifact download here.</div>}
        {gh && gh.available && !gh.logged_in && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Run <code className="mono">gh auth login</code> in a terminal to see builds here.</div>}
        {gh?.logged_in && status && !status.github && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The repo's origin is not on github.com.</div>}
        {gh?.logged_in && runs.length === 0 && status?.github && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No runs on branch {status.branch} yet.</div>}
        {runs.map(r => (
          <div key={r.databaseId} className="panel-inset" style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: stateColor(r), flexShrink: 0 }} aria-hidden />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.displayTitle}>{r.displayTitle}</span>
            <span style={{ color: stateColor(r), fontSize: 11 }}>{stateLabel(r)}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.headSha.slice(0, 7)}</span>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openGithub(r.url).catch(e => toast.error(String(e)))} aria-label="Open run on GitHub" title="Open run on GitHub"><ExternalLink size={12} /></button>
            <button className="btn btn-secondary btn-sm" disabled={r.conclusion !== 'success' || busy !== null} onClick={() => download(r)}>
              <Download size={12} /> {busy === `download-${r.databaseId}` ? 'Downloading…' : 'Download'}
            </button>
          </div>
        ))}
      </section>

      {/* Firmware + flash */}
      <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Firmware in {repo.split('/').pop()}/firmware</div>
        {firmware.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No uf2 files yet. Download a successful run above.</div>}
        {firmware.map(f => (
          <div key={f} className="panel-inset" style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f}>{f.split('/').pop()}</span>
            <button className="btn btn-primary btn-sm" disabled={flashing !== null} onClick={() => flash(f)} title="Double-tap reset on that half, then click">
              <Zap size={12} /> {flashing === f ? 'Waiting for bootloader…' : 'Flash'}
            </button>
          </div>
        ))}
        {flashing && <div style={{ fontSize: 12, color: 'var(--warning)' }}>Double-tap the reset button on the half to flash. Waiting up to 2 minutes for its bootloader volume.</div>}
      </section>
    </div>
  )
}
