/**
 * User-defined ZMK behaviors and macros on the devicetree CST, with
 * byte-exact edits (same discipline as keymap.ts: only located spans change).
 *
 * Handles nodes under `behaviors { }` and `macros { }` whose `compatible`
 * starts with `zmk,behavior-`. Properties are kept as raw devicetree value
 * text (e.g. `<200>`, `"balanced"`, `<&kp A>, <&kp B>`, or empty for flags)
 * so any property the editor does not understand survives untouched.
 */
import { namedChildren, parseDevicetree, type SyntaxNode } from './runtime'

export interface DtProp {
  name: string
  /** raw value text between `=` and `;` (trimmed), '' for boolean flags */
  value: string
  /** span of the whole property incl. trailing `;`, for removal */
  span: { start: number; end: number }
  /** span of the value text, for replacement (null for flags) */
  valueSpan: { start: number; end: number } | null
}

export interface ZmkBehavior {
  /** devicetree label (what `&label` refers to) */
  label: string
  /** node name */
  name: string
  compatible: string
  /** short kind: hold-tap, mod-morph, tap-dance, macro, sticky-key, caps-word, key-repeat, … */
  kind: string
  props: DtProp[]
  /** `#binding-cells` value, when declared */
  bindingCells: number | null
  /** where the node lives: behaviors | macros */
  section: 'behaviors' | 'macros'
  span: { start: number; end: number }
  /** index of the closing `}` */
  closeBrace: number
  indent: string
}

export interface BehaviorsDoc {
  behaviors: ZmkBehavior[]
  /** closing-brace index of the `behaviors { }` node, or null when absent */
  behaviorsClose: number | null
  macrosClose: number | null
  rootClose: number | null
  syntaxErrors: boolean
}

function prop(n: SyntaxNode, source: string): DtProp | null {
  if (n.type !== 'property') return null
  const nameNode = n.childForFieldName?.('name') ?? namedChildren(n)[0]
  if (!nameNode) return null
  const name = nameNode.text
  let end = n.endIndex
  const semi = /^[ \t]*;/.exec(source.slice(end))
  if (semi) end += semi[0].length
  // value: everything after `=` up to the node end (may span several cells arrays)
  const text = source.slice(nameNode.endIndex, n.endIndex)
  const eq = text.indexOf('=')
  if (eq < 0) return { name, value: '', span: { start: n.startIndex, end }, valueSpan: null }
  let vs = nameNode.endIndex + eq + 1
  while (vs < n.endIndex && /\s/.test(source[vs])) vs++
  let ve = n.endIndex
  while (ve > vs && (/\s/.test(source[ve - 1]) || source[ve - 1] === ';')) ve--
  return { name, value: source.slice(vs, ve), span: { start: n.startIndex, end }, valueSpan: { start: vs, end: ve } }
}

function nodeNameOf(n: SyntaxNode): string {
  const nm = n.childForFieldName?.('name')
  if (nm) return nm.text
  const ids = namedChildren(n).filter((c: SyntaxNode) => c.type === 'identifier')
  return ids.length ? ids[ids.length - 1].text : ''
}

function nodeLabelOf(n: SyntaxNode): string | null {
  const lb = n.childForFieldName?.('label')
  if (lb) return lb.text
  const ids = namedChildren(n).filter((c: SyntaxNode) => c.type === 'identifier')
  return ids.length >= 2 ? ids[0].text : null
}

function closingBrace(source: string, n: SyntaxNode): number {
  return source.lastIndexOf('}', n.endIndex - 1)
}

function indentBefore(source: string, index: number): string {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  return (/^[ \t]*/.exec(source.slice(lineStart, index)) ?? [''])[0]
}

export function parseBehaviors(source: string): BehaviorsDoc {
  const tree = parseDevicetree(source)
  const root = tree.rootNode
  const out: ZmkBehavior[] = []
  let behaviorsClose: number | null = null, macrosClose: number | null = null, rootClose: number | null = null

  const visit = (n: SyntaxNode) => {
    if (n.type === 'node') {
      const name = nodeNameOf(n)
      if (name === '/' && rootClose === null) rootClose = closingBrace(source, n)
      if (name === 'behaviors' || name === 'macros') {
        const section = name as 'behaviors' | 'macros'
        if (section === 'behaviors') behaviorsClose = closingBrace(source, n)
        else macrosClose = closingBrace(source, n)
        for (const c of namedChildren(n)) {
          if (c.type !== 'node') continue
          const props = namedChildren(c).map((p: SyntaxNode) => prop(p, source)).filter(Boolean) as DtProp[]
          const compat = props.find(p => p.name === 'compatible')?.value.replace(/^"|"$/g, '') ?? ''
          if (!compat.startsWith('zmk,behavior-')) continue
          const cells = props.find(p => p.name === '#binding-cells')?.value
          out.push({
            label: nodeLabelOf(c) ?? nodeNameOf(c),
            name: nodeNameOf(c),
            compatible: compat,
            kind: compat.replace('zmk,behavior-', ''),
            props,
            bindingCells: cells ? parseInt(cells.replace(/[<>]/g, '').trim(), 10) : null,
            section,
            span: { start: c.startIndex, end: c.endIndex },
            closeBrace: closingBrace(source, c),
            indent: indentBefore(source, c.startIndex),
          })
        }
      }
    }
    for (const c of namedChildren(n)) visit(c)
  }
  visit(root)
  return { behaviors: out, behaviorsClose, macrosClose, rootClose, syntaxErrors: root.hasError }
}

// ── edits ────────────────────────────────────────────────────────────────────

interface Edit { start: number; end: number; text: string }
function apply(source: string, edits: Edit[]): string {
  let out = source
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}

/** Set (or add) a property on a behavior. `value` is raw devicetree text; '' makes a flag. `null` removes it. */
export function setBehaviorProp(source: string, label: string, name: string, value: string | null): string {
  const doc = parseBehaviors(source)
  const b = doc.behaviors.find(x => x.label === label)
  if (!b) return source
  const existing = b.props.find(p => p.name === name)
  if (value === null) {
    if (!existing) return source
    // remove the whole line when the property owns it
    let start = existing.span.start
    while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start--
    if (start > 0 && source[start - 1] === '\n') start--
    return apply(source, [{ start, end: existing.span.end, text: '' }])
  }
  if (existing) {
    if (existing.valueSpan) {
      if (value === '') return apply(source, [{ start: existing.span.start, end: existing.span.end, text: `${name};` }])
      return apply(source, [{ ...existing.valueSpan, text: value }])
    }
    if (value === '') return source
    return apply(source, [{ start: existing.span.start, end: existing.span.end, text: `${name} = ${value};` }])
  }
  // add before the closing brace, after the last property
  const childIndent = b.props[0] ? indentBefore(source, b.props[0].span.start) : b.indent + '    '
  const line = value === '' ? `${name};` : `${name} = ${value};`
  const lineStart = source.lastIndexOf('\n', b.closeBrace - 1) + 1
  const insertAt = /^[ \t]*$/.test(source.slice(lineStart, b.closeBrace)) ? lineStart : b.closeBrace
  return apply(source, [{ start: insertAt, end: insertAt, text: insertAt === lineStart ? `${childIndent}${line}\n` : `\n${childIndent}${line}\n${b.indent}` }])
}

/** Remove a behavior node (with trailing `;`). */
export function removeBehavior(source: string, label: string): string {
  const doc = parseBehaviors(source)
  const b = doc.behaviors.find(x => x.label === label)
  if (!b) return source
  let end = b.span.end
  const semi = /^[ \t]*;/.exec(source.slice(end))
  if (semi) end += semi[0].length
  let start = b.span.start
  while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start--
  if (start > 0 && source[start - 1] === '\n') start--
  // Last node of its section preceded by a blank separator line (the shape
  // addBehavior creates): drop that separator too, so add → remove is exact.
  const after = source.slice(end)
  const nextLine = after.slice(0, after.indexOf('\n') < 0 ? after.length : after.indexOf('\n') + 1)
  const closesSection = /^\s*$/.test(nextLine) && /^\s*\}/.test(after.slice(nextLine.length))
  if (closesSection && start > 0 && source[start - 1] === '\n') start--
  return apply(source, [{ start, end, text: '' }])
}

export interface NewBehavior {
  label: string
  name?: string
  compatible: string
  /** ordered property list; value '' = flag */
  props: { name: string; value: string }[]
  section?: 'behaviors' | 'macros'
}

/** Add a behavior node. Creates the `behaviors { }` / `macros { }` section under the root node when missing. */
export function addBehavior(source: string, nb: NewBehavior): string {
  const doc = parseBehaviors(source)
  const section = nb.section ?? (nb.compatible === 'zmk,behavior-macro' ? 'macros' : 'behaviors')
  if (doc.behaviors.some(b => b.label === nb.label)) throw new Error(`a behavior labelled "${nb.label}" already exists`)
  const close = section === 'behaviors' ? doc.behaviorsClose : doc.macrosClose
  const name = nb.name ?? nb.label
  const body = (indent: string) => [
    `${indent}${nb.label}: ${name} {`,
    `${indent}    compatible = "${nb.compatible}";`,
    ...nb.props.filter(p => p.name !== 'compatible').map(p => `${indent}    ${p.name}${p.value === '' ? '' : ` = ${p.value}`};`),
    `${indent}};`,
  ].join('\n')
  if (close !== null) {
    const sib = doc.behaviors.find(b => b.section === section)
    const indent = sib ? sib.indent : indentBefore(source, close) + '    '
    const lineStart = source.lastIndexOf('\n', close - 1) + 1
    const insertAt = /^[ \t]*$/.test(source.slice(lineStart, close)) ? lineStart : close
    const text = insertAt === lineStart ? `\n${body(indent)}\n` : `\n${body(indent)}\n${indentBefore(source, close)}`
    return apply(source, [{ start: insertAt, end: insertAt, text }])
  }
  if (doc.rootClose === null) throw new Error('no root node (`/ { … };`) to add a behaviors section to')
  const rootIndent = indentBefore(source, doc.rootClose)
  const sectionText = `\n${rootIndent}    ${section} {\n${body(rootIndent + '        ')}\n${rootIndent}    };\n`
  const lineStart = source.lastIndexOf('\n', doc.rootClose - 1) + 1
  const insertAt = /^[ \t]*$/.test(source.slice(lineStart, doc.rootClose)) ? lineStart : doc.rootClose
  return apply(source, [{ start: insertAt, end: insertAt, text: insertAt === lineStart ? sectionText.slice(1) : sectionText + rootIndent }])
}

/** Split a multi-cells value like `<&kp A>, <&kp B>` into its cell groups (inner text). */
export function splitCells(value: string): string[] {
  const out: string[] = []
  const re = /<([^>]*)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) out.push(m[1].trim().split(/\s+/).join(' '))
  return out
}

export function joinCells(cells: string[]): string {
  return cells.map(c => `<${c}>`).join(', ')
}

/** Integer property helpers. */
export function intValue(p: DtProp | undefined): number | null {
  if (!p) return null
  const m = /<\s*(-?\d+)\s*>/.exec(p.value)
  return m ? parseInt(m[1], 10) : null
}
export function stringValue(p: DtProp | undefined): string | null {
  if (!p) return null
  const m = /^"(.*)"$/.exec(p.value.trim())
  return m ? m[1] : null
}
