/**
 * Build tab. "Build" makes firmware from exactly the config on screen: save,
 * commit + push the app's files, wait for that commit's GitHub Actions run,
 * download it into firmware/<sha>/ (lib/buildFlow). Flash only offers that
 * folder, and only while nothing on screen differs from the built commit.
 */
import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { RefreshCw, Hammer, Zap, ExternalLink } from 'lucide-react'
import { IS_TAURI } from '@/lib/io'
import { useToast } from '@/components/ui'
import { openGithub } from '@/lib/openUrl'
import { isAnyDirty, onDirtyChange, saveAllDirty } from '@/lib/dirty'
import { buildShownConfig, changedEditedFiles, type BuildStep, type Run } from '@/lib/buildFlow'
import type { KeyboardDef } from '@/lib/registry/types'
import SleepSetting from './SleepSetting'

interface RepoStatus { branch: string; ahead: number; behind: number; changes: string[]; remote: string | null; github: string | null; head: string }
interface GhInfo { available: boolean; logged_in: boolean; detail: string }

function stepText(s: BuildStep): string {
  switch (s.kind) {
    case 'saving': return 'Saving unsaved edits…'
    case 'pushing': return 'Committing and pushing the keymap…'
    case 'waiting': return s.run ? `GitHub is building ${s.sha.slice(0, 7)} (${s.run.status.replace('_', ' ')})…` : `Waiting for GitHub to start building ${s.sha.slice(0, 7)}…`
    case 'downloading': return `Downloading the firmware for ${s.sha.slice(0, 7)}…`
    case 'done': return `Built ${s.sha.slice(0, 7)}.`
  }
}

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
  const [step, setStep] = useState<BuildStep | null>(null)
  const [unsaved, setUnsaved] = useState(isAnyDirty())
  const [reloads, setReloads] = useState(0)

  useEffect(() => onDirtyChange(() => setUnsaved(isAnyDirty())), [])

  const refresh = useCallback(async () => {
    if (!IS_TAURI || !repo) return
    setError(null); setBusy(b => b ?? 'refresh'); setReloads(n => n + 1)
    try {
      const st = await invoke<RepoStatus>('git_repo_status', { repo })
      setStatus(st)
      setDiff(await invoke<string>('git_diff_file', { repo, path: keyboard.keymapPath }).catch(e => `Could not read the diff: ${e}`))
      setFirmware(await invoke<string[]>('list_firmware', { repo, sha: st.head }))
      const info = await invoke<GhInfo>('gh_info')
      setGh(info)
      if (info.available && info.logged_in && st.github) {
        const json = await invoke<string>('gh_run_list', { repo, branch: st.branch, limit: 5, commit: null })
        setRuns(JSON.parse(json) as Run[])
      } else setRuns([])
    } catch (e) {
      setError(String(e)); setRuns([])
    } finally { setBusy(b => (b === 'refresh' ? null : b)) }
  }, [repo, keyboard.keymapPath])

  useEffect(() => { refresh() }, [refresh])

  if (!IS_TAURI) return <div className="panel-inset" style={{ padding: 14, fontSize: 12, color: 'var(--text-secondary)' }}>Building and flashing need the desktop app.</div>
  if (!repo) return <div className="panel-inset" style={{ padding: 14, fontSize: 12, color: 'var(--text-secondary)' }}>This ZMK keyboard has no config folder, so there is nothing to build. Open Settings › Keyboards › Edit › Files and choose its zmk-config folder.</div>

  const pending = status ? changedEditedFiles(repo, keyboard, status.changes) : []
  const notBuilt = unsaved || pending.length > 0 || (status?.ahead ?? 0) > 0
  const ghReady = !!gh?.available && !!gh.logged_in && !!status?.github

  const build = async () => {
    if (!status) return
    setBusy('build'); setError(null)
    try {
      const { files } = await buildShownConfig(keyboard, {
        saveAll: saveAllDirty,
        commitPush: (paths, message) => invoke<string>('git_commit_push', { repo, paths, message }),
        runsForCommit: async sha => JSON.parse(await invoke<string>('gh_run_list', { repo, branch: status.branch, limit: 5, commit: sha })) as Run[],
        download: (run, sha) => invoke<string[]>('gh_run_download', { repo, runId: run.databaseId, sha }),
        sleep: ms => new Promise(r => setTimeout(r, ms)),
        now: () => Date.now(),
      }, setStep)
      toast.success(`Firmware ready: ${files.length} file${files.length === 1 ? '' : 's'}`)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e)); setStep(null)
    } finally {
      setBusy(null); refresh()
    }
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
  const label = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' } as const
  const head7 = status?.head.slice(0, 7)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Build</h3>
        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={busy !== null}><RefreshCw size={13} /> {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {error && <div className="panel-inset error-panel" role="alert">{error}</div>}

      {/* Build what is on screen, then flash it */}
      <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 12 }}>
            {!status ? <div className="skeleton" style={{ height: 16 }} />
              : busy === 'build' && step ? <span role="status">{stepText(step)}</span>
              : notBuilt ? <span style={{ color: 'var(--warning)' }}>The config on screen has changes that are not built yet.</span>
              : firmware.length > 0 ? <span style={{ color: 'var(--success)' }}>Firmware matches the config on screen (commit <span className="mono">{head7}</span>).</span>
              : <span>No firmware for the config on screen yet.</span>}
          </div>
          <button className="btn btn-primary btn-sm" onClick={build} disabled={!status || !ghReady || busy !== null || flashing !== null}
            title={ghReady ? 'Save, commit and push the keymap, then download its GitHub build' : 'Needs the gh CLI, a gh login and a GitHub origin'}>
            <Hammer size={12} /> {busy === 'build' ? 'Building…' : 'Build'}
          </button>
        </div>
        {notBuilt && busy !== 'build' && status && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Build saves, commits {pending.length > 0 ? pending.join(', ') : 'the keymap'} and pushes branch <strong>{status.branch}</strong>; other files stay uncommitted.
          </div>
        )}
        {!notBuilt && firmware.map(f => (
          <div key={f} className="panel-inset" style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f}>{f.split('/').pop()}</span>
            <button className="btn btn-primary btn-sm" disabled={flashing !== null || busy !== null} onClick={() => flash(f)} title={firmware.length > 1 ? `Double-tap reset on the half ${f.split('/').pop()} is for, then click` : 'Double-tap reset on the keyboard, then click'}>
              <Zap size={12} /> {flashing === f ? 'Waiting for bootloader…' : 'Flash'}
            </button>
          </div>
        ))}
        {flashing && <div style={{ fontSize: 12, color: 'var(--warning)' }}>Double-tap the reset button {firmware.length > 1 ? 'on the half this file is for' : 'on the keyboard'}. Waiting up to 2 minutes for its bootloader volume.</div>}
      </section>

      {keyboard.firmware === 'zmk' && <SleepSetting keyboard={keyboard} onSaved={refresh} reload={reloads} />}

      {/* Repo state */}
      <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={label}>Config repo</div>
        {status ? (
          <>
            <div style={{ fontSize: 12 }}>
              <span className="mono">{repo}</span> · branch <strong>{status.branch}</strong> · <span className="mono">{head7}</span>
              {status.ahead > 0 && <span className="tag" style={{ marginLeft: 6 }}>{status.ahead} unpushed</span>}
              {status.behind > 0 && <span className="tag" style={{ marginLeft: 6 }}>{status.behind} behind</span>}
              {status.github && <button className="btn-link" onClick={() => openGithub(`https://github.com/${status.github}`).catch(e => toast.error(String(e)))} style={{ marginLeft: 8, fontSize: 11 }}>{status.github} <ExternalLink size={10} /></button>}
            </div>
            {status.changes.length > 0 && (
              <div style={{ fontSize: 12 }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{status.changes.length} uncommitted change{status.changes.length === 1 ? '' : 's'}:</div>
                <pre className="mono" style={{ margin: 0, fontSize: 11, maxHeight: 120, overflow: 'auto' }}>{status.changes.join('\n')}</pre>
              </div>
            )}
            {diff && diff.trim() && (
              <details>
                <summary style={{ fontSize: 12, cursor: 'pointer' }}>Keymap diff vs last commit</summary>
                <pre className="mono" style={{ margin: '6px 0 0', fontSize: 11, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre' }}>{diff}</pre>
              </details>
            )}
          </>
        ) : <div className="skeleton" style={{ height: 40 }} />}
      </section>

      {/* Runs */}
      <section className="glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={label}>GitHub Actions</div>
        {gh && !gh.available && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The <code className="mono">gh</code> CLI is not installed. <code className="mono">brew install gh && gh auth login</code> enables Build.</div>}
        {gh && gh.available && !gh.logged_in && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Run <code className="mono">gh auth login</code> in a terminal to enable Build.</div>}
        {gh?.logged_in && status && !status.github && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The repo's origin is not on github.com.</div>}
        {gh?.logged_in && runs.length === 0 && status?.github && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No runs on branch {status.branch} yet.</div>}
        {runs.map(r => (
          <div key={r.databaseId} className="panel-inset" style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: stateColor(r), flexShrink: 0 }} aria-hidden />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.displayTitle}>{r.displayTitle}</span>
            <span style={{ color: stateColor(r), fontSize: 11 }}>{stateLabel(r)}</span>
            <span className="mono" style={{ fontSize: 10, color: r.headSha === status?.head ? 'var(--text-primary)' : 'var(--text-muted)' }}>{r.headSha.slice(0, 7)}</span>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openGithub(r.url).catch(e => toast.error(String(e)))} aria-label="Open run on GitHub" title="Open run on GitHub"><ExternalLink size={12} /></button>
          </div>
        ))}
      </section>
    </div>
  )
}
