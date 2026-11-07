import { describe, expect, test } from 'bun:test'
import { buildShownConfig, changedEditedFiles, editedPaths, runForCommit, type BuildDeps, type BuildStep, type Run } from '../src/lib/buildFlow'
import type { KeyboardDef } from '../src/lib/registry/types'

const SHA = 'caffea1'.padEnd(40, '0')
const OLD = 'e730bcb'.padEnd(40, '0')
const kb = {
  id: 'k', name: 'Corne', firmware: 'zmk', repoPath: '/r/cfg', keymapPath: '/r/cfg/config/corne_tp.keymap',
  pointing: [{ overlayPath: '/r/cfg/boards/tp.overlay' }], layout: { keys: [] }, createdAt: '',
} as unknown as KeyboardDef

const run = (sha: string, status: string, conclusion: string | null, createdAt = '2026-11-07T10:00:00Z'): Run =>
  ({ databaseId: 1, status, conclusion, displayTitle: '', createdAt, updatedAt: createdAt, headSha: sha, url: '' })

function deps(sequence: Run[][], over: Partial<BuildDeps> = {}) {
  const calls: string[] = []
  let t = 0
  let i = 0
  const d: BuildDeps = {
    saveAll: async () => { calls.push('save') },
    commitPush: async (paths) => { calls.push(`push:${paths.join(',')}`); return SHA },
    runsForCommit: async () => sequence[Math.min(i++, sequence.length - 1)],
    download: async (_r, sha) => { calls.push(`download:${sha.slice(0, 7)}`); return [`/r/cfg/firmware/${sha}/right.uf2`] },
    sleep: async (ms) => { t += ms },
    now: () => t,
    ...over,
  }
  return { d, calls }
}

describe('build flow', () => {
  test('commits the app files, waits for that commit, downloads into its folder', async () => {
    const { d, calls } = deps([[run(OLD, 'completed', 'success')], [run(SHA, 'in_progress', null)], [run(SHA, 'completed', 'success')]])
    const steps: BuildStep[] = []
    const out = await buildShownConfig(kb, d, s => steps.push(s))
    expect(calls).toEqual(['save', 'push:/r/cfg/config/corne_tp.keymap,/r/cfg/boards/tp.overlay', 'download:caffea1'])
    expect(out.files[0]).toContain(`firmware/${SHA}/`)
    expect(steps.map(s => s.kind)).toEqual(['saving', 'pushing', 'waiting', 'waiting', 'waiting', 'downloading', 'done'])
  })

  test('never downloads a build of another commit', async () => {
    const { d, calls } = deps([[run(OLD, 'completed', 'success')]])
    await expect(buildShownConfig(kb, d, () => {})).rejects.toThrow('never started')
    expect(calls.some(c => c.startsWith('download'))).toBe(false)
  })

  test('a failed run is reported, not downloaded', async () => {
    const { d, calls } = deps([[run(SHA, 'completed', 'failure')]])
    await expect(buildShownConfig(kb, d, () => {})).rejects.toThrow('failure')
    expect(calls.some(c => c.startsWith('download'))).toBe(false)
  })

  test('runForCommit picks the newest run of that sha only', () => {
    const r = runForCommit([run(SHA, 'completed', 'failure', '2026-11-07T09:00:00Z'), run(SHA, 'completed', 'success', '2026-11-07T10:00:00Z'), run(OLD, 'completed', 'success', '2026-11-08T00:00:00Z')], SHA)
    expect(r?.conclusion).toBe('success')
    expect(runForCommit([run(OLD, 'completed', 'success')], SHA)).toBeNull()
  })

  test('only changes to the app files count as "not built"', () => {
    expect(editedPaths(kb)).toHaveLength(2)
    expect(changedEditedFiles('/r/cfg', kb, [' M .claude/MEMORY.md', '?? mempalace.yaml'])).toEqual([])
    expect(changedEditedFiles('/r/cfg', kb, [' M config/corne_tp.keymap'])).toEqual(['config/corne_tp.keymap'])
  })
})
