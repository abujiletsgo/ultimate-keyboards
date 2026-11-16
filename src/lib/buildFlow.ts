/**
 * Build = firmware from exactly the config on screen.
 *
 * save unsaved edits -> commit + push the files the app edits -> wait for the
 * GitHub Actions run of that commit -> download its uf2s into
 * firmware/<sha>/. The Flash list only ever shows that folder, so a flash
 * cannot pick up a build of some other commit.
 */
import type { KeyboardDef } from '@/lib/registry/types'
import { toPosix } from './paths'

export interface Run { databaseId: number; status: string; conclusion: string | null; displayTitle: string; createdAt: string; updatedAt: string; headSha: string; url: string }

export type BuildStep =
  | { kind: 'saving' }
  | { kind: 'pushing' }
  | { kind: 'waiting'; sha: string; run: Run | null }
  | { kind: 'downloading'; sha: string; run: Run }
  | { kind: 'done'; sha: string; files: string[] }

export interface BuildDeps {
  saveAll: () => Promise<void>
  commitPush: (paths: string[], message: string) => Promise<string>
  runsForCommit: (sha: string) => Promise<Run[]>
  download: (run: Run, sha: string) => Promise<string[]>
  sleep: (ms: number) => Promise<void>
  now: () => number
}

/** Every file the app writes for this keyboard: keymap (+ combos/behaviors), QMK keymap.c, pointing files, setting .confs. */
export function editedPaths(kb: KeyboardDef): string[] {
  const out = [kb.keymapPath, kb.keymapCPath, ...(kb.confPaths ?? [])]
  for (const d of kb.pointing) out.push(d.overlayPath, d.confPath, d.westPath)
  return [...new Set(out.filter((p): p is string => !!p))]
}

/** Repo-relative form of an absolute path (git porcelain paths are relative). */
export function relToRepo(repo: string, path: string): string {
  const root = toPosix(repo).replace(/\/+$/, '') + '/'
  const p = toPosix(path)
  return p.startsWith(root) ? p.slice(root.length) : p
}

/** Porcelain lines (`XY path`, `R  old -> new`) that touch one of the app's files. */
export function changedEditedFiles(repo: string, kb: KeyboardDef, porcelain: string[]): string[] {
  const mine = new Set(editedPaths(kb).map(p => relToRepo(repo, p)))
  return porcelain
    .map(l => l.slice(3).split(' -> ').pop()!.replace(/^"|"$/g, ''))
    .filter(p => mine.has(p))
}

/** Newest run of exactly this commit. */
export function runForCommit(runs: Run[], sha: string): Run | null {
  const mine = runs.filter(r => r.headSha === sha)
  mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return mine[0] ?? null
}

export const POLL_MS = 10_000
/** A run must appear within this long after the push. */
export const APPEAR_TIMEOUT_MS = 3 * 60_000
/** And finish within this long. */
export const FINISH_TIMEOUT_MS = 30 * 60_000

export async function buildShownConfig(kb: KeyboardDef, deps: BuildDeps, onStep: (s: BuildStep) => void): Promise<{ sha: string; files: string[] }> {
  onStep({ kind: 'saving' })
  await deps.saveAll()

  onStep({ kind: 'pushing' })
  const sha = await deps.commitPush(editedPaths(kb), `Update ${kb.name} keymap from Ultimate Keyboards`)

  const start = deps.now()
  let run: Run | null = null
  for (;;) {
    run = runForCommit(await deps.runsForCommit(sha), sha)
    onStep({ kind: 'waiting', sha, run })
    if (run && run.status === 'completed') break
    const waited = deps.now() - start
    if (!run && waited > APPEAR_TIMEOUT_MS) throw new Error(`GitHub Actions never started a build for ${sha.slice(0, 7)}. Check the repo's workflow runs on push to this branch.`)
    if (waited > FINISH_TIMEOUT_MS) throw new Error(`The build for ${sha.slice(0, 7)} is still ${run?.status ?? 'queued'} after 30 minutes.`)
    await deps.sleep(POLL_MS)
  }
  if (run.conclusion !== 'success') throw new Error(`The build for ${sha.slice(0, 7)} ${run.conclusion ?? 'failed'}. Open the run on GitHub for the error.`)

  onStep({ kind: 'downloading', sha, run })
  const files = await deps.download(run, sha)
  if (files.length === 0) throw new Error(`The build for ${sha.slice(0, 7)} produced no uf2 files.`)
  onStep({ kind: 'done', sha, files })
  return { sha, files }
}
