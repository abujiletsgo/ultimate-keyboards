/**
 * Plan and apply an "add pointing device" template to a config repo, and the
 * exact inverse. Pure text functions (no I/O) so they are unit-testable; the
 * wizard reads the three files, calls `planAdd`/`planRemove`, shows the diffs,
 * and writes the results through lib/io.
 */
import { MARK, renderConf, renderOverlay, type PointingTemplate } from './templates'

export interface FileChange {
  path: string
  before: string
  after: string
  /** human summary of the change */
  note: string
}

export interface Plan {
  overlay: FileChange
  conf: FileChange
  west: FileChange | null
}

// ── west.yml (text-level YAML edit, keeps the user's formatting) ─────────────

export function westHasProject(west: string, project: string): boolean {
  return new RegExp(`^\\s*-\\s*name:\\s*${project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(#.*)?$`, 'm').test(west)
}

export function westAddModule(west: string, remoteName: string, urlBase: string, project: string, revision: string, id: string): string {
  if (westHasProject(west, project)) return west
  let out = west
  const hasRemote = new RegExp(`^\\s*-\\s*name:\\s*${remoteName}\\s*$`, 'm').test(out)
  const remotesIdx = out.search(/^\s*remotes:\s*$/m)
  const projectsIdx = out.search(/^\s*projects:\s*$/m)
  if (remotesIdx < 0 || projectsIdx < 0) throw new Error('west.yml has no remotes:/projects: sections')
  const indentOf = (idx: number) => (/^([ \t]*)/.exec(out.slice(out.lastIndexOf('\n', idx) + 1)) ?? ['', ''])[1]
  const itemIndent = (sectionIdx: number) => {
    const after = out.slice(out.indexOf('\n', sectionIdx) + 1)
    const m = /^([ \t]*)-/.exec(after)
    return m ? m[1] : indentOf(sectionIdx) + '  '
  }
  const marker = `# uk:pointing:${id}`
  if (!hasRemote) {
    const ind = itemIndent(remotesIdx)
    const block = `${ind}- name: ${remoteName} ${marker}\n${ind}  url-base: ${urlBase}\n`
    // insert before `projects:` (the next section after remotes)
    const p2 = out.search(/^\s*projects:\s*$/m)
    out = out.slice(0, p2) + block + out.slice(p2)
  }
  const pIdx = out.search(/^\s*projects:\s*$/m)
  const ind = itemIndent(pIdx)
  // insert after the last project item: before `self:` if present, else at end
  const selfIdx = out.search(/^\s*self:\s*$/m)
  const block = `${ind}- name: ${project} ${marker}\n${ind}  remote: ${remoteName}\n${ind}  revision: ${revision}\n`
  if (selfIdx >= 0) out = out.slice(0, selfIdx) + block + out.slice(selfIdx)
  else out = out.replace(/\s*$/, '\n') + block
  return out
}

export function westRemoveModule(west: string, id: string): string {
  // remove any list item whose first line carries our marker, plus its indented continuation lines
  const lines = west.split('\n')
  const out: string[] = []
  let skipping = false, skipIndent = ''
  for (const line of lines) {
    if (line.includes(`# uk:pointing:${id}`)) { skipping = true; skipIndent = (/^([ \t]*)/.exec(line) ?? ['', ''])[1]; continue }
    if (skipping) {
      const ind = (/^([ \t]*)/.exec(line) ?? ['', ''])[1]
      if (line.trim() === '' || (ind.length > skipIndent.length && !line.trim().startsWith('-'))) continue
      skipping = false
    }
    out.push(line)
  }
  return out.join('\n')
}

// ── marked blocks in overlay / conf ─────────────────────────────────────────

function stripBlock(text: string, begin: string, end: string): string {
  const b = text.indexOf(begin)
  if (b < 0) return text
  const e = text.indexOf(end, b)
  if (e < 0) return text
  let start = b
  if (start > 0 && text[start - 1] === '\n') start--
  let stop = e + end.length
  if (text[stop] === '\n') stop++
  return text.slice(0, start) + text.slice(stop)
}

export function hasMarkedBlock(text: string, id: string): boolean {
  return text.includes(MARK(id, 'begin')) || text.includes(MARK(id, 'begin').replace('//', '#'))
}

// ── plans ────────────────────────────────────────────────────────────────────

export interface RepoFiles {
  overlayPath: string
  overlay: string
  confPath: string
  conf: string
  westPath: string | null
  west: string | null
}

export function planAdd(t: PointingTemplate, values: Record<string, string>, id: string, files: RepoFiles): Plan {
  if (hasMarkedBlock(files.overlay, id)) throw new Error(`the overlay already contains a "${id}" block`)
  const overlayAfter = files.overlay.replace(/\s*$/, '\n') + renderOverlay(t, values, id)
  const confAfter = files.conf.replace(/\s*$/, files.conf.trim() ? '\n' : '') + renderConf(t, id)
  let west: FileChange | null = null
  if (t.west) {
    if (!files.west || !files.westPath) throw new Error('this driver needs a west.yml module but no config/west.yml was found')
    const after = westAddModule(files.west, t.west.remoteName, t.west.urlBase, t.west.project, t.west.revision, id)
    west = { path: files.westPath, before: files.west, after, note: after === files.west ? `module ${t.west.project} already present` : `add module ${t.west.project}` }
  }
  return {
    overlay: { path: files.overlayPath, before: files.overlay, after: overlayAfter, note: `append ${t.bus.toUpperCase()} bus, sensor node and input listener` },
    conf: { path: files.confPath, before: files.conf, after: confAfter, note: `enable ${t.conf.length} Kconfig options` },
    west,
  }
}

export function planRemove(id: string, files: RepoFiles): Plan {
  const overlayAfter = stripBlock(files.overlay, MARK(id, 'begin'), MARK(id, 'end'))
  const confAfter = stripBlock(files.conf, MARK(id, 'begin').replace('//', '#'), MARK(id, 'end').replace('//', '#'))
  let west: FileChange | null = null
  if (files.west && files.westPath) {
    const after = westRemoveModule(files.west, id)
    if (after !== files.west) west = { path: files.westPath, before: files.west, after, note: 'remove module' }
  }
  return {
    overlay: { path: files.overlayPath, before: files.overlay, after: overlayAfter, note: overlayAfter === files.overlay ? 'no marked block found (added by hand?) — nothing removed' : 'remove the marked block' },
    conf: { path: files.confPath, before: files.conf, after: confAfter, note: confAfter === files.conf ? 'no marked block' : 'remove the marked Kconfig lines' },
    west,
  }
}

// ── tiny unified diff for the preview ───────────────────────────────────────

export function unifiedDiff(a: string, b: string, name: string): string {
  const al = a.split('\n'), bl = b.split('\n')
  // LCS-based diff (files are small)
  const n = al.length, m = bl.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = al[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: string[] = [`--- ${name}`, `+++ ${name}`]
  let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && al[i] === bl[j]) { out.push(' ' + al[i]); i++; j++ }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { out.push('+' + bl[j]); j++ }
    else { out.push('-' + al[i]); i++ }
  }
  // collapse long unchanged runs
  const res: string[] = []
  let run: string[] = []
  const flush = () => {
    if (run.length > 6) res.push(...run.slice(0, 3), `@@ … ${run.length - 6} unchanged lines … @@`, ...run.slice(-3))
    else res.push(...run)
    run = []
  }
  for (const l of out) { if (l.startsWith(' ')) run.push(l); else { flush(); res.push(l) } }
  flush()
  return res.join('\n')
}
