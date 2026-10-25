// Real native editor, isolated storage and mocked status-only transport. No HID activity.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5186'
const output = process.env.VISUAL_OUTPUT || '/tmp/uk-native-modifiers'
await mkdir(output, { recursive: true })
const rules = [
  { type: 'simple', description: 'Control H', fromKey: 'h', fromModifiers: ['control'], toKey: 'escape' },
  { type: 'layer_binding', description: 'Nav H left', fromKey: 'h', layerName: 'nav', toKey: 'left_arrow', custom: { retain: true } },
  { type: 'layer_activator', description: 'Space Nav', fromKey: 'spacebar', layerName: 'nav', tapKey: 'spacebar' },
]
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [800, 1200]) {
    const context = await browser.newContext({ viewport: { width, height: width === 800 ? 600 : 800 }, reducedMotion: 'reduce' })
    await context.addInitScript(rules => { localStorage.setItem('uk.activeSection', 'karabiner'); localStorage.setItem('uk.karabiner', JSON.stringify({ state: { rules, profileTitle: 'Native modifier controls' }, version: 0 })); window.__nativeCalls = [] }, rules)
    const page = await context.newPage(); const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.route('**/src/lib/nativeRemapping.ts*', async route => {
      const response = await route.fetch(); const body = await response.text()
      await route.fulfill({ response, body: body + `\nObject.assign(nativeRemapping,createNativeRemappingController({available:true,invoke:async command=>{window.__nativeCalls.push(command);if(command!=='native_remapping_status')throw new Error('Unexpected runtime action');return {state:'stopped',message:'Stopped',driverReady:false,inputMonitoringGranted:true,helperInstalled:true,enabled:false,capturedDevices:0,protocolVersion:1}}}));` })
    })
    await page.goto(baseURL)
    await page.getByRole('tab', { name: 'Layer 1: nav', exact: true }).click()
    const key = page.getByRole('group', { name: 'MacBook keyboard' }).locator('[title^="h:"]')
    await key.focus(); await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Edit binding h', exact: true })
    const mods = dialog.getByRole('group', { name: 'Output modifiers', exact: true })
    await mods.waitFor()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await mods.getByRole('button', { pressed: true }).count(), 0)
    await page.screenshot({ path: `${output}/unselected-${width}.png` })
    const command = mods.getByRole('button', { name: 'command', exact: true })
    const shift = mods.getByRole('button', { name: 'shift', exact: true })
    await command.click(); await shift.focus(); await page.keyboard.press('Space')
    assert.equal(await command.getAttribute('aria-pressed'), 'true')
    assert.equal(await shift.getAttribute('aria-pressed'), 'true')
    assert.match(await command.getAttribute('class'), /active/)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.screenshot({ path: `${output}/selected-${width}.png` })
    const rect = await dialog.boundingBox()
    assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= (width === 800 ? 600 : 800))
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('uk.karabiner')).state.rules)
    assert.deepEqual(saved, rules.map((rule, index) => index === 1 ? { ...rule, toModifiers: ['command', 'shift'] } : rule))
    assert.equal(await key.evaluate(el => el === document.activeElement), true)
    await page.keyboard.press('Enter')
    await command.focus(); await page.keyboard.press('Space'); await shift.click()
    assert.equal(await mods.getByRole('button', { pressed: true }).count(), 0)
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('uk.karabiner')).state.rules)
    assert.deepEqual(saved, rules)
    const calls = await page.evaluate(() => window.__nativeCalls)
    assert(calls.every(command => command === 'native_remapping_status'))
    assert.deepEqual(errors, [])
    results.push({ width, pointerAndKeyboardToggle: true, modifiersPersistedAndCleared: true, metadataAndOrderPreserved: true, localApplyOnly: true, popupBounded: true })
    await context.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify({ output, results }))
} finally { await browser.close() }
