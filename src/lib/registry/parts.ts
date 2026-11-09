/**
 * What a ZMK config builds, read from build.yaml: one target per firmware
 * file. A target is a shield (on a controller board such as nice!nano) or,
 * for keyboards with the controller built in (Glove80, nice!60, BT60,
 * Planck), the board itself. A single keyboard has one target; a split has
 * one per half, sometimes plus a dongle.
 *
 * Pure text, no I/O; shared by detection, the deep-sleep setting and the
 * catalogue lookups.
 */

/** Suffix that names one part of a multi-part keyboard: `corne_left`, `glove80_lh`. */
export const PART_SUFFIX = /_(left|right|lh|rh|dongle|central|peripheral)$/

/** `corne_left` → `corne`, `glove80_rh` → `glove80`, `nice60` → `nice60`. */
export function partBase(name: string): string {
  return name.replace(PART_SUFFIX, '')
}

/** `nice60//zmk` → `nice60`, `nice_nano@2.0.0//zmk` → `nice_nano`. */
export function boardName(board: string): string {
  return board.replace(/\/\/.*$/, '').replace(/@.*$/, '').replace(/\/.*$/, '')
}

export interface BuildTarget {
  /** shield name, or the board name without revision or qualifiers */
  name: string
  kind: 'shield' | 'board'
}

/** Values of `key:` in one block: a scalar, an inline `[a, b]` list or an indented `- a` list. */
function values(block: string, key: string): string[] {
  const out: string[] = []
  const re = new RegExp(`^[ \\t]*(?:-[ \\t]+)?${key}[ \\t]*:[ \\t]*(.*)$`, 'gm')
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const raw = m[1].trim()
    if (raw.startsWith('[')) {
      out.push(...raw.replace(/^\[|\].*$/g, '').split(',').map(clean).filter(Boolean))
    } else if (raw) {
      out.push(clean(raw))
    } else {
      // indented block list on the following lines
      const rest = block.slice(m.index + m[0].length).split('\n').slice(1)
      for (const line of rest) {
        const item = /^[ \t]+-[ \t]*([^\s:#]+)[ \t]*$/.exec(line)
        if (!item) break
        out.push(clean(item[1]))
      }
    }
  }
  return out
}

function clean(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '').trim()
}

/**
 * Build targets in build.yaml order, without `settings_reset`. Handles both
 * the `include:` list and the older `board: [...]` / `shield: [...]` matrix.
 */
export function parseBuildTargets(yaml: string): BuildTarget[] {
  const text = yaml.replace(/#.*$/gm, '')
  // `include:` entries each start with "- key:"; the matrix form is one block
  const blocks = /^\s*include\s*:/m.test(text)
    ? text.split(/^[ \t]*-[ \t]+(?=[\w-]+[ \t]*:)/m).slice(1)
    : [text]
  const out: BuildTarget[] = []
  const seen = new Set<string>()
  const add = (t: BuildTarget) => {
    if (t.name === 'settings_reset' || !t.name || seen.has(t.name)) return
    seen.add(t.name); out.push(t)
  }
  for (const block of blocks) {
    const shields = values(block, 'shield')
    if (shields.length) {
      for (const s of shields) add({ name: s, kind: 'shield' })
    } else {
      for (const b of values(block, 'board')) add({ name: boardName(b), kind: 'board' })
    }
  }
  return out
}
