/**
 * Path helpers that accept both separators. Windows paths use backslashes (and
 * the app joins some of them with `/`, so one path can hold both), so no code
 * in src may split a path on '/' itself; tests/paths.test.ts fails if one does.
 */

/** The non-empty segments of a path: `C:\a\b/c.txt` → `['C:', 'a', 'b', 'c.txt']`. */
export function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean)
}

/** The last segment: `C:\a\keymap.json` → `keymap.json`. Empty for a root. */
export function basename(path: string): string {
  return segments(path).pop() ?? ''
}

/** Everything before the last segment, keeping the path's own separator: `C:\a\b.txt` → `C:\a`. */
export function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (cut < 0) return ''
  if (cut === 0) return trimmed[0]
  const head = trimmed.slice(0, cut)
  return /^[A-Za-z]:$/.test(head) ? head + trimmed[cut] : head
}

/** The last `count` segments joined with `/`, for showing a long path short: `C:\a\b\c\d.txt`, 3 → `b/c/d.txt`. */
export function tail(path: string, count: number): string {
  return segments(path).slice(-count).join('/')
}

/** The same path with `/` everywhere, for comparing against git's output. */
export function toPosix(path: string): string {
  return path.replace(/\\/g, '/')
}

/** Split an id that uses `/` on every OS (a QMK keyboard such as `keychron/q1v2`). It is not a file path. */
export function splitId(id: string): string[] {
  return id.split('/')
}
