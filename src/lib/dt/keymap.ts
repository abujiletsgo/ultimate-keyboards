/**
 * ZMK keymap model on top of the devicetree CST, with byte-exact edits.
 *
 * Every edit is a splice of a span the parser located; nothing else in the
 * file is touched, so comments, macros, includes and unknown nodes survive
 * byte-for-byte. Edits are applied right-to-left so earlier spans stay valid.
 */
import { namedChildren, parseDevicetree, syntaxErrorLines, type SyntaxNode, type Tree } from './runtime'

// ── model ────────────────────────────────────────────────────────────────────

export interface ZMKCombo {
  name: string
  bindings: string
  keyPositions: number[]
  layers?: number[]
}

export interface ZMKLayer {
  index: number
  name: string
  displayName?: string
  keys: string[]
}

export interface ZMKKeymap {
  layers: ZMKLayer[]
  combos: ZMKCombo[]
  rawSource: string
  /** 1-based lines with syntax errors (macro-heavy files); non-empty ⇒ open read-only */
  syntaxErrors: number[]
}

interface Span { start: number; end: number }

interface LayerSpans {
  node: Span
  nameIdent: Span
  displayNameString: Span | null // the string literal incl. quotes
  /** inner span of the bindings cells, between `<` and `>` */
  bindingsInner: Span | null
  bindingSpans: Span[]
  indent: string
}

interface ComboSpans {
  node: Span
  bindingsInner: Span | null
  keyPositionsInner: Span | null
  layersProperty: Span | null // whole `layers = <…>;` property
  layersInner: Span | null
  /** end of the key-positions property (after `;`) — where a new `layers` goes */
  afterKeyPositions: number | null
  indent: string
}

interface Parsed {
  tree: Tree
  keymapNode: SyntaxNode | null
  layers: (ZMKLayer & { spans: LayerSpans })[]
  combosNode: SyntaxNode | null
  combos: (ZMKCombo & { spans: ComboSpans })[]
}

// ── CST helpers ──────────────────────────────────────────────────────────────

function nodeName(n: SyntaxNode): string | null {
  const name = n.childForFieldName?.('name')
  if (name) return name.text
  // fallback: the last identifier before the `{`
  const ids = namedChildren(n).filter((c: SyntaxNode) => c.type === 'identifier')
  return ids.length ? ids[ids.length - 1].text : null
}

function nameIdentNode(n: SyntaxNode): SyntaxNode | null {
  const name = n.childForFieldName?.('name')
  if (name) return name
  const ids = namedChildren(n).filter((c: SyntaxNode) => c.type === 'identifier')
  return ids.length ? ids[ids.length - 1] : null
}

function childNodes(n: SyntaxNode): SyntaxNode[] {
  return namedChildren(n).filter((c: SyntaxNode) => c.type === 'node')
}

function propertyOf(n: SyntaxNode, prop: string): SyntaxNode | null {
  for (const c of namedChildren(n)) {
    if (c.type === 'property') {
      const id = c.childForFieldName?.('name') ?? namedChildren(c)[0]
      if (id && id.text === prop) return c
    }
  }
  return null
}

function cellsOf(prop: SyntaxNode): SyntaxNode[] {
  return namedChildren(prop).filter((c: SyntaxNode) => c.type === 'integer_cells')
}

function stringValueOf(prop: SyntaxNode): { text: string; node: SyntaxNode } | null {
  const s = namedChildren(prop).find((c: SyntaxNode) => c.type === 'string_literal')
  return s ? { text: s.text.replace(/^"|"$/g, ''), node: s } : null
}

function findNodeByName(root: SyntaxNode, name: string, compatible?: string): SyntaxNode | null {
  let found: SyntaxNode | null = null
  const walk = (n: SyntaxNode) => {
    if (found) return
    if (n.type === 'node' && nodeName(n) === name) {
      if (!compatible) { found = n; return }
      const c = propertyOf(n, 'compatible')
      if (c && stringValueOf(c)?.text === compatible) { found = n; return }
    }
    for (const c of namedChildren(n)) walk(c)
  }
  walk(root)
  return found
}

/** Text of a cells node without the surrounding `< >`. */
function innerSpan(cells: SyntaxNode): Span {
  return { start: cells.startIndex + 1, end: cells.endIndex - 1 }
}

function normalize(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').trim().split(/\s+/).join(' ')
}

/**
 * Split a cells node into bindings: every `&reference` starts one, and each
 * following non-comment token belongs to it. Spans are in source bytes.
 */
function bindingSpans(source: string, cells: SyntaxNode): { spans: Span[]; keys: string[] } {
  const spans: Span[] = []
  let cur: Span | null = null
  for (const c of namedChildren(cells)) {
    if (c.type === 'comment') continue
    if (c.type === 'reference') {
      if (cur) spans.push(cur)
      cur = { start: c.startIndex, end: c.endIndex }
    } else if (cur) {
      cur.end = c.endIndex
    } else {
      // bare token before any reference — keep it visible as its own key
      spans.push({ start: c.startIndex, end: c.endIndex })
    }
  }
  if (cur) spans.push(cur)
  return { spans, keys: spans.map(s => normalize(source.slice(s.start, s.end))) }
}

/** Index of a node's closing `}` (the CST node span also covers the trailing `;`). */
function closingBrace(source: string, n: SyntaxNode): number {
  return source.lastIndexOf('}', n.endIndex - 1)
}

function indentBefore(source: string, index: number): string {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  const m = /^[ \t]*/.exec(source.slice(lineStart, index))
  return m ? m[0] : ''
}

/** Span of a node plus its trailing `;` and the whitespace/newline before it. */
function removalSpan(source: string, n: SyntaxNode): Span {
  let end = n.endIndex
  const semi = /^[ \t]*;/.exec(source.slice(end))
  if (semi) end += semi[0].length
  let start = n.startIndex
  while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start--
  if (start > 0 && source[start - 1] === '\n') start--
  return { start, end }
}

// ── parse ────────────────────────────────────────────────────────────────────

function parseFull(source: string): Parsed {
  const tree = parseDevicetree(source)
  const root = tree.rootNode
  const keymapNode = findNodeByName(root, 'keymap', 'zmk,keymap') ?? findNodeByName(root, 'keymap')
  const combosNode = findNodeByName(root, 'combos', 'zmk,combos') ?? findNodeByName(root, 'combos')

  const layers: Parsed['layers'] = []
  if (keymapNode) {
    let index = 0
    for (const ln of childNodes(keymapNode)) {
      const bindingsProp = propertyOf(ln, 'bindings')
      const cells = bindingsProp ? cellsOf(bindingsProp)[0] : null
      if (!cells) continue
      const { spans, keys } = bindingSpans(source, cells)
      if (keys.length === 0) continue
      const dn = propertyOf(ln, 'display-name')
      const dnStr = dn ? stringValueOf(dn) : null
      const ident = nameIdentNode(ln)
      layers.push({
        index: index++,
        name: nodeName(ln) ?? '',
        displayName: dnStr?.text,
        keys,
        spans: {
          node: { start: ln.startIndex, end: ln.endIndex },
          nameIdent: ident ? { start: ident.startIndex, end: ident.endIndex } : { start: ln.startIndex, end: ln.startIndex },
          displayNameString: dnStr ? { start: dnStr.node.startIndex, end: dnStr.node.endIndex } : null,
          bindingsInner: innerSpan(cells),
          bindingSpans: spans,
          indent: indentBefore(source, ln.startIndex),
        },
      })
    }
  }

  const combos: Parsed['combos'] = []
  if (combosNode) {
    for (const cn of childNodes(combosNode)) {
      const b = propertyOf(cn, 'bindings')
      const kp = propertyOf(cn, 'key-positions')
      const ly = propertyOf(cn, 'layers')
      if (!b) continue
      const bCells = cellsOf(b)[0] ?? null
      const kpCells = kp ? cellsOf(kp)[0] ?? null : null
      const lyCells = ly ? cellsOf(ly)[0] ?? null : null
      const ints = (cells: SyntaxNode | null) => cells ? normalize(source.slice(cells.startIndex + 1, cells.endIndex - 1)).split(' ').filter(Boolean).map(Number) : []
      const kpEnd = kp ? (() => { const semi = /^[ \t]*;/.exec(source.slice(kp.endIndex)); return kp.endIndex + (semi ? semi[0].length : 0) })() : null
      combos.push({
        name: nodeName(cn) ?? '',
        bindings: bCells ? normalize(source.slice(bCells.startIndex + 1, bCells.endIndex - 1)) : '',
        keyPositions: ints(kpCells),
        layers: lyCells ? ints(lyCells) : undefined,
        spans: {
          node: { start: cn.startIndex, end: cn.endIndex },
          bindingsInner: bCells ? innerSpan(bCells) : null,
          keyPositionsInner: kpCells ? innerSpan(kpCells) : null,
          layersProperty: ly ? removalSpan(source, ly) : null,
          layersInner: lyCells ? innerSpan(lyCells) : null,
          afterKeyPositions: kpEnd,
          indent: indentBefore(source, cn.startIndex),
        },
      })
    }
  }
  return { tree, keymapNode, layers, combosNode, combos }
}

export function parseKeymapText(source: string): ZMKKeymap {
  const p = parseFull(source)
  return {
    layers: p.layers.map(({ spans: _s, ...l }) => l),
    combos: p.combos.map(({ spans: _s, ...c }) => c),
    rawSource: source,
    syntaxErrors: syntaxErrorLines(p.tree),
  }
}

// ── edits ────────────────────────────────────────────────────────────────────

interface Edit { start: number; end: number; text: string }

function applyEdits(source: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let out = source
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}

function formatBindingRows(keys: string[], indent: string, perRow = 12): string {
  const rows: string[] = []
  for (let k = 0; k < keys.length; k += perRow) rows.push(indent + '    ' + keys.slice(k, k + perRow).join('  '))
  return '\n' + rows.join('\n') + '\n' + indent
}

/**
 * Splice changed bindings in place. Only bindings whose normalized text
 * differs are touched. If a layer's key count changed (should not happen
 * through the UI), its cells are rewritten as a whole.
 */
export function updateLayerBindingsInSource(source: string, layers: ZMKLayer[]): string {
  const p = parseFull(source)
  const edits: Edit[] = []
  for (const layer of layers) {
    const cur = p.layers.find(l => l.name === layer.name)
    if (!cur || !cur.spans.bindingsInner) continue
    if (cur.spans.bindingSpans.length === layer.keys.length) {
      for (let k = 0; k < layer.keys.length; k++) {
        if (cur.keys[k] !== layer.keys[k]) edits.push({ ...cur.spans.bindingSpans[k], text: layer.keys[k] })
      }
    } else {
      edits.push({ ...cur.spans.bindingsInner, text: formatBindingRows(layer.keys, cur.spans.indent + '    ') })
    }
  }
  return applyEdits(source, edits)
}

function comboNodeText(combo: ZMKCombo, indent: string): string {
  const lines = [
    `${indent}${combo.name} {`,
    `${indent}    bindings = <${combo.bindings}>;`,
    `${indent}    key-positions = <${combo.keyPositions.join(' ')}>;`,
    ...(combo.layers && combo.layers.length > 0 ? [`${indent}    layers = <${combo.layers.join(' ')}>;`] : []),
    `${indent}};`,
  ]
  return lines.join('\n')
}

export function generateCombosBlock(combos: ZMKCombo[]): string {
  const lines = ['    combos {', '        compatible = "zmk,combos";', '']
  for (const c of combos) { lines.push(comboNodeText(c, '        ')); lines.push('') }
  lines.push('    };')
  return lines.join('\n')
}

/**
 * Minimal-diff combo update: untouched nodes stay byte-identical, changed
 * properties are spliced, new nodes are appended before the block's closing
 * brace, removed nodes are deleted with their trailing `;`.
 */
export function updateCombosInSource(source: string, combos: ZMKCombo[]): string {
  const p = parseFull(source)
  if (!p.combosNode) {
    if (combos.length === 0) return source
    const anchor = p.keymapNode ? p.keymapNode.startIndex : null
    if (anchor === null) return source
    const indent = indentBefore(source, anchor)
    const block = generateCombosBlock(combos).split('\n').map(l => l.replace(/^    /, indent)).join('\n')
    const lineStart = source.lastIndexOf('\n', anchor - 1) + 1
    return source.slice(0, lineStart) + block + '\n\n' + source.slice(lineStart)
  }
  const edits: Edit[] = []
  const byName = new Map(combos.map(c => [c.name, c]))
  const existing = new Set<string>()
  for (const cur of p.combos) {
    existing.add(cur.name)
    const next = byName.get(cur.name)
    if (!next) { edits.push({ ...removalSpan(source, { startIndex: cur.spans.node.start, endIndex: cur.spans.node.end }), text: '' }); continue }
    if (cur.spans.bindingsInner && next.bindings !== cur.bindings) edits.push({ ...cur.spans.bindingsInner, text: next.bindings })
    if (cur.spans.keyPositionsInner && next.keyPositions.join(' ') !== cur.keyPositions.join(' ')) edits.push({ ...cur.spans.keyPositionsInner, text: next.keyPositions.join(' ') })
    const nextLayers = next.layers && next.layers.length > 0 ? next.layers.join(' ') : ''
    const curLayers = cur.layers && cur.layers.length > 0 ? cur.layers.join(' ') : ''
    if (nextLayers !== curLayers) {
      if (!nextLayers && cur.spans.layersProperty) edits.push({ ...cur.spans.layersProperty, text: '' })
      else if (nextLayers && cur.spans.layersInner) edits.push({ ...cur.spans.layersInner, text: nextLayers })
      else if (nextLayers && cur.spans.afterKeyPositions !== null) edits.push({ start: cur.spans.afterKeyPositions, end: cur.spans.afterKeyPositions, text: `\n${cur.spans.indent}    layers = <${nextLayers}>;` })
    }
  }
  const added = combos.filter(c => !existing.has(c.name))
  if (added.length) {
    const close = closingBrace(source, p.combosNode)
    const childIndent = p.combos[0]?.spans.indent ?? indentBefore(source, p.combosNode.startIndex) + '    '
    const blockIndent = indentBefore(source, p.combosNode.startIndex)
    // insert before the closing brace, keeping its own line
    const lineStart = source.lastIndexOf('\n', close - 1) + 1
    const insertAt = /^[ \t]*$/.test(source.slice(lineStart, close)) ? lineStart : close
    const text = added.map(c => comboNodeText(c, childIndent)).join('\n\n') + '\n' + (insertAt === lineStart ? '' : blockIndent)
    edits.push({ start: insertAt, end: insertAt, text: insertAt === lineStart ? text : '\n' + text })
  }
  return applyEdits(source, edits)
}

/** Append a new all-&trans layer node at the end of the keymap block. */
export function addLayerToSource(source: string, name: string, keyCount: number): string {
  const p = parseFull(source)
  if (!p.keymapNode) return source
  const close = closingBrace(source, p.keymapNode)
  const indent = p.layers[0]?.spans.indent ?? indentBefore(source, p.keymapNode.startIndex) + '    '
  const keys = Array(keyCount).fill('&trans')
  const node = [
    `${indent}${name} {`,
    `${indent}    display-name = "${name}";`,
    `${indent}    bindings = <${formatBindingRows(keys, indent + '    ')}>;`,
    `${indent}};`,
  ].join('\n')
  const lineStart = source.lastIndexOf('\n', close - 1) + 1
  const insertAt = /^[ \t]*$/.test(source.slice(lineStart, close)) ? lineStart : close
  return applyEdits(source, [{ start: insertAt, end: insertAt, text: insertAt === lineStart ? node + '\n' : '\n' + node + '\n' + indentBefore(source, p.keymapNode.startIndex) }])
}

/** Rename a layer node (and its display-name when it mirrored the name). */
export function renameLayerInSource(source: string, oldName: string, newName: string): string {
  const p = parseFull(source)
  const l = p.layers.find(x => x.name === oldName)
  if (!l) return source
  const edits: Edit[] = [{ ...l.spans.nameIdent, text: newName }]
  if (l.spans.displayNameString) edits.push({ ...l.spans.displayNameString, text: `"${newName}"` })
  return applyEdits(source, edits)
}

/** Remove a layer node entirely (with its trailing `;`). */
export function deleteLayerFromSource(source: string, name: string): string {
  const p = parseFull(source)
  const l = p.layers.find(x => x.name === name)
  if (!l) return source
  return applyEdits(source, [{ ...removalSpan(source, { startIndex: l.spans.node.start, endIndex: l.spans.node.end }), text: '' }])
}
