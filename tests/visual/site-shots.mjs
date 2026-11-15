// Website screenshots of the real Mac editor at 2x (1440x948 css = the MacBook shell's screen ratio): the default profile (home-row mods + K+L, I+O, W+E combos)
// plus a Space layer with H J K L arrows, rendered with a mocked native status.
// VISUAL_BASE_URL=http://127.0.0.1:5191 VISUAL_OUTPUT=/tmp/uk-site-shots node tests/visual/site-shots.mjs
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.VISUAL_OUTPUT || '/tmp/uk-site-shots'
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5191'
await mkdir(output, { recursive: true })

const mods = { a: 'left_control', s: 'left_option', d: 'left_shift', f: 'left_command', j: 'right_command', k: 'right_shift', l: 'right_option', semicolon: 'right_control' }
const sym = { control: '⌃', option: '⌥', shift: '⇧', command: '⌘' }
// Layer rules first: in rule order an earlier home-row rule on J, K or L would shadow the arrows.
const layerRules = [
  { type: 'layer_activator', description: 'Space: hold → nav, tap → space', fromKey: 'spacebar', tapKey: 'spacebar', layerName: 'nav' },
  { type: 'layer_binding', description: 'nav h ←', layerName: 'nav', fromKey: 'h', toKey: 'left_arrow' },
  { type: 'layer_binding', description: 'nav j ↓', layerName: 'nav', fromKey: 'j', toKey: 'down_arrow' },
  { type: 'layer_binding', description: 'nav k ↑', layerName: 'nav', fromKey: 'k', toKey: 'up_arrow' },
  { type: 'layer_binding', description: 'nav l →', layerName: 'nav', fromKey: 'l', toKey: 'right_arrow' },
]
const rules = [
  ...layerRules,
  ...Object.entries(mods).map(([key, modKey]) => ({ type: 'homerow_mod', description: `${key}: hold ${sym[modKey.split('_')[1]]}`, fromKey: key, tapKey: key, modKey })),
  { type: 'combo', description: 'k+l → Enter', fromKeys: ['k', 'l'], toKey: 'return_or_enter' },
  { type: 'combo', description: 'i+o → Backspace', fromKeys: ['i', 'o'], toKey: 'delete_or_backspace' },
  { type: 'combo', description: 'w+e → Escape', fromKeys: ['w', 'e'], toKey: 'escape' },
]
const status = (running) => ({ state: running ? 'running' : 'stopped', message: running ? 'Remapping is on.' : 'Ready to apply explicitly.', driverReady: true, inputMonitoringGranted: true, helperInstalled: true, enabled: running, capturedDevices: running ? 1 : 0, protocolVersion: 1 })

const browser = await chromium.launch({ headless: true })
async function open(running) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 948 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  await context.addInitScript(({ rules, st }) => {
    localStorage.setItem('uk.activeSection', 'karabiner')
    localStorage.setItem('uk.karabiner', JSON.stringify({ state: { rules, profileTitle: 'My MacBook layout' }, version: 0 }))
    window.__nativeStatus = st
  }, { rules, st: status(running) })
  const page = await context.newPage()
  await page.route('**/src/lib/nativeRemapping.ts*', async route => {
    const response = await route.fetch()
    const body = await response.text()
    await route.fulfill({ response, body: body + `
Object.assign(nativeRemapping,createNativeRemappingController({available:true,invoke:async command=>{if(command!=='native_remapping_status')throw new Error('Unexpected native action: '+command);return window.__nativeStatus}}));
` })
  })
  await page.goto(baseURL)
  await page.getByRole('tab', { name: 'Keymap', exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Keymap', exact: true }).click() // Templates may open first
  await page.getByRole('group', { name: 'MacBook keyboard' }).waitFor()
  // Website shots only: the site never mentions the optional export, so its collapsed panel is hidden here.
  await page.evaluate(() => document.querySelectorAll('details, section, div').forEach(el => {
    const head = el.querySelector(':scope > summary, :scope > button')
    if (head && /Karabiner/.test(head.textContent || '')) el.style.display = 'none'
  }))
  return { page, context }
}
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
const shots = []
try {
  let { page, context } = await open(false)
  await settle(page); await page.screenshot({ path: `${output}/editor-keymap.png` }); shots.push('editor-keymap')
  await page.getByRole('tab', { name: /nav/ }).first().click(); await settle(page)
  await page.screenshot({ path: `${output}/editor-layer.png` }); shots.push('editor-layer')
  for (const [tab, name] of [['Combos', 'editor-combos'], ['Homerow mods', 'editor-homerow']]) {
    const t = page.getByRole('tab', { name: tab, exact: true })
    if (await t.count()) { await t.click(); await settle(page); await page.screenshot({ path: `${output}/${name}.png` }); shots.push(name) }
  }
  await context.close();
  ({ page, context } = await open(true))
  await settle(page); await page.screenshot({ path: `${output}/editor-running.png` }); shots.push('editor-running')
  await context.close()
} finally {
  await browser.close()
}
console.log(JSON.stringify({ output, shots }))
