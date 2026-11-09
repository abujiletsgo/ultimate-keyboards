/**
 * Frame check: fails on code shapes that leave a screen hidden or empty in its
 * first frame, or that raise the cost of every frame (Studio Decisions #77,
 * lesson "120 Hz, right first frame"). Static and fast; the runtime half is
 * tests/visual/first-frame.mjs, which pauses every animation at frame zero.
 *
 *   bun scripts/check-frames.ts            # src/ and src-tauri/src
 *   bun scripts/check-frames.ts --json
 *
 * Allow one line with `frames-allow: <reason>` on that line or the line above
 * (a reason is required). Fix the cause first.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export interface Finding { file: string; line: number; rule: string; message: string }

type Rule = { id: string; message: string; exts: string[]; check: (src: string) => number[] }

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length

function* all(re: RegExp, src: string): Generator<RegExpExecArray> {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  for (let m = g.exec(src); m; m = g.exec(src)) yield m
}

/** Text of a balanced (...) or {...} group starting at `open`. */
function group(src: string, open: number): string {
  const o = src[open], c = o === '(' ? ')' : '}'
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === o) depth++
    else if (src[i] === c && --depth === 0) return src.slice(open, i + 1)
  }
  return src.slice(open)
}

const HIDDEN = /opacity\s*:\s*0(?:\.0+)?\s*(?:[;}!]|$)|scale\(\s*0(?:\.0+)?\s*[,)]|visibility\s*:\s*hidden/m

export const rules: Rule[] = [
  {
    id: 'frame/hidden-first-keyframe',
    message: 'Entrance starts hidden (opacity 0 / scale 0): if it never runs (hidden window, tray, dropped frames) the content stays invisible. Animate transform only; the first frame shows the resting state.',
    exts: ['.css', '.tsx', '.ts'],
    check: src => {
      const out: number[] = []
      for (const m of all(/@keyframes\s+[\w-]+\s*\{/, src)) {
        const body = group(src, m.index + m[0].length - 1)
        const first = /(?:^|[{\s])(from|0%)[^{]*\{([^}]*)\}/.exec(body)
        if (first && HIDDEN.test(first[2])) out.push(lineOf(src, m.index))
      }
      // Web Animations API: el.animate([{ opacity: 0 }, …])
      for (const m of all(/\.animate\(\s*\[\s*\{([^}]*)\}/, src)) {
        if (/opacity\s*:\s*0(?:\.0+)?\b(?!\.)/.test(m[1])) out.push(lineOf(src, m.index))
      }
      return out
    },
  },
  {
    id: 'frame/endless-animation',
    message: 'Endless animation keeps the app drawing every frame forever; behind backdrop-filter glass it re-blurs every pane each frame. Animate a change, then stop.',
    exts: ['.css', '.tsx', '.ts'],
    check: src => [...all(/animation(?:-iteration-count)?\s*:[^;}\n]*\binfinite\b/, src)].map(m => lineOf(src, m.index)),
  },
  {
    id: 'frame/large-filter-blur',
    message: 'Large filter blur is recomputed whenever its layer or anything over it repaints; draw the softness into the gradient or a pre-blurred image instead.',
    exts: ['.css', '.tsx', '.ts'],
    check: src => [...all(/(?<![-\w])filter\s*:\s*[^;}\n]*blur\(\s*(\d+)px/, src)]
      .filter(m => Number(m[1]) >= 40).map(m => lineOf(src, m.index)),
  },
  {
    id: 'frame/refresh-cap',
    message: 'Frame pacing held near 60 Hz; leave the rate to the display (120 Hz panels need 8.3 ms frames) and fix the cost instead.',
    exts: ['.ts', '.tsx', '.rs', '.swift'],
    check: src => [
      // setInterval(fn, ≤19): a timer standing in for the display's frame clock
      ...[...all(/\bsetInterval\s*\(/, src)].filter(m => {
        const call = group(src, m.index + m[0].length - 1)
        const delay = /,\s*(\d+(?:\.\d+)?)\s*\)$/.exec(call)
        return !!delay && Number(delay[1]) < 20
      }),
      ...all(/1000\s*\/\s*60\b|\b16\.6\d*\b/, src),
      ...all(/preferredFramesPerSecond\s*=\s*(?:[1-9]\d?|1[01]\d)\b/, src),
    ].map(m => lineOf(src, m.index)),
  },
  {
    id: 'frame/measured-after-paint',
    message: 'Layout measured in useEffect runs after the first paint, so the first frame is drawn unmeasured and then jumps. Measure in useLayoutEffect, or place with CSS.',
    exts: ['.tsx', '.ts'],
    check: src => {
      const out: number[] = []
      for (const m of all(/\buseEffect\s*\(/, src)) {
        const body = group(src, m.index + m[0].length - 1)
        if (/getBoundingClientRect\(|\boffset(?:Width|Height)\b|\bclient(?:Width|Height)\b|new\s+ResizeObserver\b/.test(body) && /\bset[A-Z]\w*\s*\(/.test(body)) {
          out.push(lineOf(src, m.index))
        }
      }
      return out
    },
  },
]

/** WKWebView holds page rendering near 60 fps unless the app turns that off. */
export function checkWebviewUncapped(rustSources: string[]): boolean {
  return rustSources.some(s => /PreferPageRenderingUpdatesNear60FPSEnabled/.test(s) && /_setEnabled\s*:[^\]]*?forFeature\s*:/.test(s))
}

function allowed(lines: string[], line: number, rule: string): boolean {
  const re = /frames-allow(?:\[([\w/-]+)\])?:\s*[A-Za-z0-9]/
  for (const l of [lines[line - 1], lines[line - 2]]) {
    const m = l && re.exec(l)
    if (m && (!m[1] || m[1] === rule)) return true
  }
  return false
}

/** Blank out comments (keeping line breaks) so prose about a pattern is not the pattern. */
export function maskComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:\\'"`])\/\/[^\n]*/g, (m, pre: string) => pre + blank(m.slice(pre.length)))
}

export function checkSource(file: string, src: string): Finding[] {
  const ext = file.slice(file.lastIndexOf('.'))
  const lines = src.split('\n')
  const code = maskComments(src)
  const out: Finding[] = []
  for (const rule of rules) {
    if (!rule.exts.includes(ext)) continue
    for (const line of new Set(rule.check(code))) {
      if (!allowed(lines, line, rule.id)) out.push({ file, line, rule: rule.id, message: rule.message })
    }
  }
  return out
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === 'dist' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(css|tsx?|rs|swift)$/.test(name) && !/\.test\.tsx?$/.test(name)) acc.push(p)
  }
  return acc
}

export function checkRepo(root: string): Finding[] {
  const files = ['src', 'src-tauri/src'].flatMap(d => { try { return walk(join(root, d)) } catch { return [] } })
  const findings = files.flatMap(f => checkSource(relative(root, f), readFileSync(f, 'utf8')))
  const rust = files.filter(f => f.endsWith('.rs')).map(f => readFileSync(f, 'utf8'))
  if (rust.length && !checkWebviewUncapped(rust)) {
    findings.push({ file: 'src-tauri/src', line: 0, rule: 'frame/webview-60fps', message: 'WKWebView keeps PreferPageRenderingUpdatesNear60FPSEnabled on by default; the app must turn it off so 120 Hz displays get 120 Hz rendering.' })
  }
  return findings
}

if (import.meta.main) {
  const root = join(import.meta.dir, '..')
  const findings = checkRepo(root)
  if (process.argv.includes('--json')) console.log(JSON.stringify(findings, null, 2))
  else for (const f of findings) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.message}`)
  if (!process.argv.includes('--json')) console.log(findings.length ? `\n${findings.length} frame finding(s)` : 'frames: clean')
  process.exit(findings.length ? 1 : 0)
}
