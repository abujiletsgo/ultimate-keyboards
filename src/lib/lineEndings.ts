/**
 * Line endings for config-file edits.
 *
 * Windows checkouts often use core.autocrlf=true, so a keymap, west.yml,
 * overlay or .conf arrives with CRLF. Editors in lib work on LF text and
 * `keepEol` puts the file's own endings back: a CRLF file stays CRLF, an LF
 * file stays LF, and in a mixed file every line the edit did not touch keeps
 * its own ending (new lines take the file's majority ending).
 */

export type Eol = '\n' | '\r\n'

export const toLf = (text: string): string => text.replace(/\r\n/g, '\n')

/** The ending most lines use; LF on a tie or when there is no line break. */
export function detectEol(text: string): Eol {
  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/\n/g) ?? []).length - crlf
  return crlf > lf ? '\r\n' : '\n'
}

/** Run `edit` on the LF form of `text` and return the result with `text`'s endings. */
export function keepEol(text: string, edit: (lf: string) => string): string {
  if (!text.includes('\r\n')) return edit(text)
  const lf = toLf(text)
  const out = edit(lf)
  if (out === lf) return text
  if (!/(^|[^\r])\n/.test(text)) return out.replace(/\n/g, '\r\n')
  return restoreMixed(text, lf, out)
}

/** Mixed file: lines that survive the edit keep their ending; the rest use the majority. */
function restoreMixed(original: string, lf: string, out: string): string {
  const fallback = detectEol(original)
  const a = lf.split('\n'), b = out.split('\n')
  const aCrlf = original.split('\n').map(l => l.endsWith('\r'))
  // map each output line to the input line it came from (or -1)
  const from = new Array<number>(b.length).fill(-1)
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) { from[p] = p; p++ }
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) { from[b.length - 1 - s] = a.length - 1 - s; s++ }
  const n = a.length - p - s, m = b.length - p - s
  if (n > 0 && m > 0 && n * m <= 4_000_000) {
    const w = m + 1
    const dp = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = a[p + i] === b[p + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
      }
    }
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[p + i] === b[p + j]) { from[p + j] = p + i; i++; j++ }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++
      else j++
    }
  }
  let res = ''
  for (let j = 0; j < b.length; j++) {
    res += b[j]
    if (j === b.length - 1) break
    const crlf = from[j] >= 0 && from[j] < a.length - 1 ? aCrlf[from[j]] : fallback === '\r\n'
    res += crlf ? '\r\n' : '\n'
  }
  return res
}
