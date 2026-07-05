/**
 * pointingParser — minimal-diff reader/writer for pointing-device settings in
 * ZMK devicetree overlay files (.overlay). Same ethos as the keymap
 * serializer: untouched text stays byte-identical; edits splice only the
 * affected property line.
 *
 * Supported constructs:
 *   - boolean props:   `flag-name;` (present/absent)
 *   - int props:       `name = <123>;`
 *   - string props:    `name = "value";`
 *   - scaler processor:`input-processors = <&zip_xy_scaler MUL DIV>;`
 *   - listener child nodes for per-layer overrides (snipe/scroll):
 *       snipe { layers = <N>; input-processors = <&zip_xy_scaler 1 D>; };
 */

export interface NodeSpan {
  /** absolute offset of the node's opening `{` */
  open: number
  /** absolute offset of the node's closing `}` */
  close: number
  /** body text between the braces */
  body: string
}

/** Locate a devicetree node by a regex matching its label/name (first match). */
export function findNode(source: string, nameRe: RegExp): NodeSpan | null {
  const m = nameRe.exec(source)
  if (!m) return null
  const open = source.indexOf('{', m.index)
  if (open === -1) return null
  let depth = 0
  let i = open
  while (i < source.length) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
    i++
  }
  return { open, close: i, body: source.slice(open + 1, i) }
}

// ── Boolean flag props (`name;`) ─────────────────────────────────────────────

export function getBoolProp(node: NodeSpan, name: string): boolean {
  return new RegExp(`(^|\\n)\\s*${escapeRe(name)}\\s*;`).test(node.body)
}

export function setBoolProp(source: string, node: NodeSpan, name: string, value: boolean): string {
  const has = getBoolProp(node, name)
  if (has === value) return source
  if (value) {
    // Insert before the node's closing brace, matching sibling indentation
    const indent = detectIndent(node.body)
    return source.slice(0, node.close) + `${indent}${name};\n    ` + source.slice(node.close)
  }
  // Remove the line containing the flag
  const re = new RegExp(`\\n[ \\t]*${escapeRe(name)}\\s*;`)
  const abs = node.body.search(re)
  if (abs === -1) return source
  const m = re.exec(node.body)!
  const start = node.open + 1 + abs
  return source.slice(0, start) + source.slice(start + m[0].length)
}

// ── Int props (`name = <N>;`) ────────────────────────────────────────────────

export function getIntProp(node: NodeSpan, name: string): number | null {
  const m = new RegExp(`${escapeRe(name)}\\s*=\\s*<(\\d+)>`).exec(node.body)
  return m ? parseInt(m[1], 10) : null
}

export function setIntProp(source: string, node: NodeSpan, name: string, value: number): string {
  const re = new RegExp(`(${escapeRe(name)}\\s*=\\s*<)(\\d+)(>)`)
  const m = re.exec(node.body)
  if (m) {
    if (m[2] === String(value)) return source
    const start = node.open + 1 + m.index + m[1].length
    return source.slice(0, start) + String(value) + source.slice(start + m[2].length)
  }
  // Property missing — insert before closing brace
  const indent = detectIndent(node.body)
  return source.slice(0, node.close) + `${indent}${name} = <${value}>;\n    ` + source.slice(node.close)
}

// ── String props (`name = "v";`) ─────────────────────────────────────────────

export function getStringProp(node: NodeSpan, name: string): string | null {
  const m = new RegExp(`${escapeRe(name)}\\s*=\\s*"([^"]*)"`).exec(node.body)
  return m ? m[1] : null
}

export function setStringProp(source: string, node: NodeSpan, name: string, value: string): string {
  const re = new RegExp(`(${escapeRe(name)}\\s*=\\s*")([^"]*)(")`)
  const m = re.exec(node.body)
  if (m) {
    if (m[2] === value) return source
    const start = node.open + 1 + m.index + m[1].length
    return source.slice(0, start) + value + source.slice(start + m[2].length)
  }
  const indent = detectIndent(node.body)
  return source.slice(0, node.close) + `${indent}${name} = "${value}";\n    ` + source.slice(node.close)
}

// ── zip_xy_scaler on a listener (`input-processors = <&zip_xy_scaler A B>;`) ─

export interface ScalerValue { mul: number; div: number }

export function getScaler(node: NodeSpan): ScalerValue | null {
  const m = /input-processors\s*=\s*<\s*&zip_xy_scaler\s+(\d+)\s+(\d+)\s*>/.exec(node.body)
  return m ? { mul: parseInt(m[1], 10), div: parseInt(m[2], 10) } : null
}

export function setScaler(source: string, node: NodeSpan, mul: number, div: number): string {
  const re = /(input-processors\s*=\s*<\s*&zip_xy_scaler\s+)(\d+)(\s+)(\d+)(\s*>)/
  const m = re.exec(node.body)
  if (m) {
    if (m[2] === String(mul) && m[4] === String(div)) return source
    const start = node.open + 1 + m.index
    const replaced = `${m[1]}${mul}${m[3]}${div}${m[5]}`
    return source.slice(0, start) + replaced + source.slice(start + m[0].length)
  }
  const indent = detectIndent(node.body)
  return source.slice(0, node.close) + `${indent}input-processors = <&zip_xy_scaler ${mul} ${div}>;\n    ` + source.slice(node.close)
}

// ── Snipe child node on a listener ───────────────────────────────────────────

export interface SnipeConfig { layer: number; divisor: number }

export function getSnipe(source: string, listenerRe: RegExp): SnipeConfig | null {
  const listener = findNode(source, listenerRe)
  if (!listener) return null
  const child = findNode(listener.body, /\bsnipe\s*\{/)
  if (!child) return null
  const layerM = /layers\s*=\s*<(\d+)>/.exec(child.body)
  const divM = /&zip_xy_scaler\s+1\s+(\d+)/.exec(child.body)
  if (!layerM || !divM) return null
  return { layer: parseInt(layerM[1], 10), divisor: parseInt(divM[1], 10) }
}

/** Enable/update or remove the snipe child node. Ensures processors include. */
export function setSnipe(source: string, listenerRe: RegExp, cfg: SnipeConfig | null): string {
  let result = ensureProcessorsInclude(source)
  const listener = findNode(result, listenerRe)
  if (!listener) return source

  // Locate existing child span within the listener (absolute offsets)
  const childRel = findNode(listener.body, /\bsnipe\s*\{/)
  if (childRel) {
    let end = listener.open + 1 + childRel.close + 1
    const semi = result.slice(end).match(/^\s*;/)
    if (semi) end += semi[0].length
    // include leading whitespace/newline
    let start = listener.open + 1 + listener.body.search(/\n[ \t]*snipe\s*\{/)
    if (start < listener.open + 1) start = listener.open + 1 + childRel.open
    if (cfg === null) {
      return result.slice(0, start) + result.slice(end)
    }
    const node = snipeNodeText(cfg)
    return result.slice(0, start) + `\n${node}` + result.slice(end)
  }

  if (cfg === null) return result
  const node = snipeNodeText(cfg)
  return result.slice(0, listener.close) + `\n${node}\n    ` + result.slice(listener.close)
}

function snipeNodeText(cfg: SnipeConfig): string {
  return [
    `        snipe {`,
    `            layers = <${cfg.layer}>;`,
    `            input-processors = <&zip_xy_scaler 1 ${cfg.divisor}>;`,
    `        };`,
  ].join('\n')
}

/** Add `#include <input/processors.dtsi>` if the overlay lacks it. */
export function ensureProcessorsInclude(source: string): string {
  if (source.includes('<input/processors.dtsi>')) return source
  // Insert after the last existing #include, or at the top
  const includes = [...source.matchAll(/^#include\s+.*$/gm)]
  if (includes.length > 0) {
    const last = includes[includes.length - 1]
    const end = last.index! + last[0].length
    return source.slice(0, end) + '\n#include <input/processors.dtsi>' + source.slice(end)
  }
  return '#include <input/processors.dtsi>\n' + source
}

// ── helpers ──────────────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Indentation used by the node's existing property lines (default 8 spaces). */
function detectIndent(body: string): string {
  const m = /\n([ \t]+)\S/.exec(body)
  return m ? m[1] : '        '
}
