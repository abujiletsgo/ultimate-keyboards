/**
 * Build the bundled layout catalogue from ZMK's shared physical layouts
 * (app/dts/layouts/**.dtsi in zmkfirmware/zmk). Run with:
 *
 *   bun run scripts/build-catalogue.ts
 *
 * Output: src/lib/layout/catalogue/zmk-layouts.json — an array of
 * { id, vendor, board, variant, displayName, keyCount, aliases, layout }.
 * Committed to the repo so the app never needs the network.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parseZmkPhysicalLayouts } from '../src/lib/layout/zmkDtsi'

const REPO = 'zmkfirmware/zmk'
const BRANCH = 'main'
const UA = 'ultimate-keyboards catalogue builder'

interface Entry {
  id: string
  vendor: string
  board: string
  variant: string
  displayName: string
  keyCount: number
  /** shield / keyboard names this layout should match, lower-case */
  aliases: string[]
  layout: ReturnType<typeof parseZmkPhysicalLayouts>[number]['layout']
}

async function main() {
  const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers: { 'User-Agent': UA } })
    .then(r => r.json()) as { tree: { path: string }[] }
  const files = tree.tree
    .map(e => e.path)
    .filter(p => p.startsWith('app/dts/layouts/') && p.endsWith('.dtsi') && !p.endsWith('position_map.dtsi'))
  const entries: Entry[] = []
  for (const path of files) {
    const text = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`, { headers: { 'User-Agent': UA } }).then(r => r.text())
    const rel = path.replace('app/dts/layouts/', '').replace(/\.dtsi$/, '')
    const parts = rel.split('/') // vendor/board[/variant] or common/family/variant
    const vendor = parts[0]
    const board = parts[1]
    const variant = parts.length > 2 ? parts.slice(2).join('/') : ''
    for (const node of parseZmkPhysicalLayouts(text, `zmk:${rel}`)) {
      const aliases = new Set<string>([board.toLowerCase()])
      if (variant) aliases.add(`${board}_${variant}`.toLowerCase())
      entries.push({
        id: `${rel}#${node.label}`,
        vendor, board, variant,
        displayName: node.displayName,
        keyCount: node.layout.keys.length,
        aliases: [...aliases],
        layout: node.layout,
      })
      console.log(`${rel} → ${node.label} (${node.layout.keys.length} keys)`)
    }
  }
  const outDir = join(import.meta.dir, '..', 'src', 'lib', 'layout', 'catalogue')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'zmk-layouts.json'), JSON.stringify(entries, null, 0) + '\n')
  console.log(`wrote ${entries.length} layouts`)
}

main().catch(e => { console.error(e); process.exit(1) })
