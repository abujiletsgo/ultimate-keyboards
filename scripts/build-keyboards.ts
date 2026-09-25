/**
 * Build the bundled keyboard catalogue from ZMK's in-tree shields and boards
 * (zmkfirmware/zmk, MIT): every `*.zmk.yml` with `features: [keys]`, its
 * physical layout (inline or one of the shared layouts already in
 * src/lib/layout/catalogue/zmk-layouts.json) and its default keymap.
 *
 *   bun run scripts/build-keyboards.ts
 *
 * Output: src/lib/catalogue/zmk-keyboards.json (committed; the app never
 * needs the network for ZMK keyboards).
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { initDevicetree } from '../src/lib/dt/runtime'
import { parseZmkPhysicalLayouts } from '../src/lib/layout/zmkDtsi'
import { parseMatrixTransforms, gridLayoutFromTransform } from '../src/lib/layout/matrixGrid'
import type { PhysicalLayout } from '../src/lib/layout/types'
import shared from '../src/lib/layout/catalogue/zmk-layouts.json'

const REPO = 'zmkfirmware/zmk'
const BRANCH = 'main'
const UA = 'ultimate-keyboards catalogue builder'
const ROOT = join(import.meta.dir, '..')

await initDevicetree({
  runtime: join(ROOT, 'node_modules/web-tree-sitter/web-tree-sitter.wasm'),
  grammar: join(ROOT, 'node_modules/tree-sitter-devicetree/tree-sitter-devicetree.wasm'),
})
const { parseKeymapText } = await import('../src/lib/zmkParser')

export interface ZmkCatalogueKeyboard {
  id: string
  name: string
  type: 'shield' | 'board'
  url?: string
  /** controller the shield needs, e.g. pro_micro / seeed_xiao */
  requires: string[]
  features: string[]
  /** e.g. ["corne_left", "corne_right"]; empty for unibody */
  siblings: string[]
  studio: boolean
  keyCount: number
  layout: PhysicalLayout
  /** default keymap source, verbatim (MIT) */
  keymap: string
  /** false when the default keymap uses macros the preview cannot expand (layout still shown) */
  keymapPreview: boolean
  /** true when the layout is a grid from the matrix transform (ZMK ships no physical layout) */
  gridLayout: boolean
  layerNames: string[]
  /** path in zmkfirmware/zmk */
  path: string
}

/** Minimal YAML for zmk.yml: scalars, `[a, b]` lists and `- item` lists. */
function parseMeta(text: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  let listKey: string | null = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '')
    const item = /^\s+-\s+(.+)$/.exec(line)
    if (item && listKey) { (out[listKey] as string[]).push(item[1].trim().replace(/^"|"$/g, '')); continue }
    const kv = /^([\w-]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    const [, k, v] = kv
    if (v === '') { out[k] = []; listKey = k; continue }
    listKey = null
    const inline = /^\[(.*)\]$/.exec(v)
    out[k] = inline ? inline[1].split(',').map(s => s.trim()).filter(Boolean) : v.trim().replace(/^"|"$/g, '')
  }
  return out
}

const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : [])
const get = (path: string) => fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`, { headers: { 'User-Agent': UA } }).then(r => (r.ok ? r.text() : ''))

async function main() {
  const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers: { 'User-Agent': UA } })
    .then(r => r.json()) as { tree: { path: string; type: string }[] }
  const paths = tree.tree.filter(e => e.type === 'blob').map(e => e.path)
  const metas = paths.filter(p => p.startsWith('app/boards/') && p.endsWith('.zmk.yml'))
  const byLabel = new Map((shared as { id: string; layout: PhysicalLayout }[]).map(e => [e.id.split('#')[1], e.layout]))

  const out: ZmkCatalogueKeyboard[] = []
  const skipped: string[] = []
  for (const metaPath of metas) {
    const meta = parseMeta(await get(metaPath))
    const type = meta.type as string
    if ((type !== 'shield' && type !== 'board') || !arr(meta.features).includes('keys')) continue
    const id = meta.id as string
    const dir = metaPath.slice(0, metaPath.lastIndexOf('/'))
    const inDir = paths.filter(p => p.startsWith(dir + '/') && !p.slice(dir.length + 1).includes('/'))
    const keymapPath = inDir.find(p => p.endsWith(`/${id}.keymap`)) ?? inDir.find(p => p.endsWith('.keymap'))
    if (!keymapPath) { skipped.push(`${id}: no keymap`); continue }
    const keymap = await get(keymapPath)

    // physical layouts: inline nodes plus `&label` references to shared ones
    const layouts: PhysicalLayout[] = []
    const grids: PhysicalLayout[] = []
    let chosen: string | null = null
    for (const f of inDir.filter(p => /\.(dtsi|overlay|dts)$/.test(p))) {
      const text = await get(f)
      for (const n of parseZmkPhysicalLayouts(text, `zmk:${f}`)) layouts.push(n.layout)
      for (const t of parseMatrixTransforms(text)) grids.push(gridLayoutFromTransform(t))
      const c = /zmk,physical-layout\s*=\s*&(\w+)/.exec(text)
      if (c) chosen = c[1]
      for (const m of text.matchAll(/&(\w+_layout)\b/g)) { const l = byLabel.get(m[1]); if (l) layouts.push(l) }
    }
    if (chosen && byLabel.has(chosen)) layouts.unshift(byLabel.get(chosen)!)

    let km
    try { km = parseKeymapText(keymap) } catch (e) { skipped.push(`${id}: keymap does not parse (${e})`); continue }
    const parsedCount = km.layers[0]?.keys.length ?? 0
    const exact = layouts.find(l => l.keys.length === parsedCount) ?? grids.find(l => l.keys.length === parsedCount)
    // a keymap built from #define macros parses short; keep the keyboard, drop only the preview
    const layout = exact ?? layouts[0] ?? grids[0]
    if (!layout) { skipped.push(`${id}: no physical layout or matrix transform`); continue }
    const keymapPreview = !!exact
    const gridLayout = !layouts.includes(layout)
    const keyCount = layout.keys.length

    out.push({
      id, name: meta.name as string, type: type as 'shield' | 'board', url: meta.url as string | undefined,
      requires: arr(meta.requires), features: arr(meta.features), siblings: arr(meta.siblings),
      studio: arr(meta.features).includes('studio'),
      keyCount, layout: { ...layout, name: `${meta.name}`, source: 'catalogue', origin: `zmk:${id}` },
      keymap, keymapPreview, gridLayout, layerNames: km.layers.map(l => l.name), path: dir,
    })
    console.log(`${id} (${keyCount} keys${arr(meta.siblings).length ? ', split' : ''}${gridLayout ? ', grid' : ''}${keymapPreview ? '' : ', no preview'})`)
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  const outDir = join(ROOT, 'src', 'lib', 'catalogue')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'zmk-keyboards.json'), JSON.stringify(out) + '\n')
  console.log(`\nwrote ${out.length} keyboards (${out.filter(k => k.siblings.length).length} split); skipped ${skipped.length}:`)
  for (const s of skipped) console.log('  - ' + s)
}

main().catch(e => { console.error(e); process.exit(1) })
