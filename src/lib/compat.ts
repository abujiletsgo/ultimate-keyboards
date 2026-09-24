/**
 * Compatibility report for a ZMK keymap: names the constructs the current
 * (regex-based, minimal-diff) editor does not own. A keymap with any
 * blocking construct opens read-only, so the editor never rewrites what it
 * cannot faithfully reproduce. The real devicetree parser (Phase 2) shrinks
 * this list.
 */

export interface CompatIssue {
  /** 1-based line */
  line: number
  construct: string
  detail: string
  blocking: boolean
}

export interface CompatReport {
  issues: CompatIssue[]
  /** true when every issue is non-blocking */
  editable: boolean
}

export function checkZmkCompatibility(source: string, syntaxErrorLines: number[] = []): CompatReport {
  const issues: CompatIssue[] = []
  for (const line of syntaxErrorLines) {
    issues.push({ line, construct: 'syntax the parser cannot read', detail: 'usually a C macro standing in for devicetree (e.g. ZMK_LAYER(...))', blocking: true })
  }
  const lines = source.split('\n')

  // Locate the keymap block (line span) so conditionals inside it can be flagged as blocking.
  const kmStart = lines.findIndex(l => /\bkeymap\s*\{/.test(l))
  let kmEnd = -1
  if (kmStart >= 0) {
    let depth = 0
    for (let i = kmStart; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) { kmEnd = i; break } }
      }
      if (kmEnd >= 0) break
    }
  }
  const inKeymap = (i: number) => kmStart >= 0 && i >= kmStart && (kmEnd < 0 || i <= kmEnd)

  lines.forEach((raw, i) => {
    const l = raw.trim()
    if (/^#\s*(if|ifdef|ifndef|else|elif|endif)\b/.test(l)) {
      issues.push({
        line: i + 1, construct: 'preprocessor conditional', detail: l,
        blocking: inKeymap(i),
      })
    } else if (/^#\s*include\s+"[^"]*\.(keymap|dtsi)"/.test(l)) {
      issues.push({
        line: i + 1, construct: 'local include', detail: l,
        blocking: true,
      })
    } else if (/^#\s*define\b/.test(l) && /\b(bindings|keymap)\b/.test(l)) {
      issues.push({ line: i + 1, construct: 'macro defining bindings', detail: l, blocking: true })
    } else if (/\bsensor-bindings\s*=/.test(l)) {
      issues.push({ line: i + 1, construct: 'sensor-bindings (encoders)', detail: 'shown but not editable yet', blocking: false })
    } else if (/compatible\s*=\s*"zmk,conditional-layers"/.test(l)) {
      issues.push({ line: i + 1, construct: 'conditional layers', detail: 'layer deletion cannot renumber these yet', blocking: false })
    }
  })

  if (kmStart < 0) {
    issues.push({ line: 1, construct: 'no keymap block', detail: 'no `keymap { … }` node found', blocking: true })
  }

  return { issues, editable: issues.every(i => !i.blocking) }
}
