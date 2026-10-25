// Exact user task in an isolated browser: physical V on Layer1 -> US ANSI +.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5186'
const output = process.env.VISUAL_OUTPUT || '/tmp/uk-native-symbols'
await mkdir(output, { recursive: true })
const rules = [
  { type: 'simple', description: 'Control V', fromKey: 'v', fromModifiers: ['control'], toKey: 'escape' },
  { type: 'layer_binding', description: 'Layer1 V', fromKey: 'v', layerName: 'layer1', toKey: 'v', metadata: { retain: true } },
  { type: 'layer_activator', description: 'Space Layer1', fromKey: 'spacebar', layerName: 'layer1', tapKey: 'spacebar' },
  { type: 'combo', description: 'VB Escape', fromKeys: ['v', 'b'], toKey: 'escape' },
]
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [800, 1200]) {
    const context = await browser.newContext({ viewport: { width, height: width === 800 ? 600 : 800 }, reducedMotion: 'reduce' })
    await context.addInitScript(rules => { localStorage.setItem('uk.activeSection', 'karabiner'); localStorage.setItem('uk.karabiner', JSON.stringify({ state: { rules, profileTitle: 'Layer1 V plus' }, version: 0 })); window.__nativeCalls = [] }, rules)
    const page = await context.newPage(); const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.route('**/src/lib/nativeRemapping.ts*', async route => {
      const response = await route.fetch(); const body = await response.text()
      await route.fulfill({ response, body: body + `\nObject.assign(nativeRemapping,createNativeRemappingController({available:true,invoke:async command=>{window.__nativeCalls.push(command);if(command!=='native_remapping_status')throw new Error('Unexpected runtime action');return {state:'stopped',message:'Stopped',driverReady:false,inputMonitoringGranted:true,helperInstalled:true,enabled:false,capturedDevices:0,protocolVersion:1}}}));` })
    })
    await page.goto(baseURL)
    await page.getByRole('tab', { name: 'Layer 1: layer1', exact: true }).click()
    const key = page.getByRole('group', { name: 'MacBook keyboard' }).locator('[title^="v:"]')
    const dialog = page.getByRole('dialog', { name: 'Edit binding v', exact: true })
    const picker = () => dialog.locator('button[aria-label="Key"]')
    const search = page.getByRole('textbox', { name: 'Search Key', exact: true })
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const savedRules = () => page.evaluate(() => JSON.parse(localStorage.getItem('uk.karabiner')).state.rules)
    await key.focus(); await page.keyboard.press('Enter')
    await picker().click(); await search.fill('+')
    await page.getByRole('dialog', { name: 'Key', exact: true }).getByRole('button', { name: '+ · plus', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'keypad_plus', exact: true }).count(), 0)
    await settle(); await page.screenshot({ path: `${output}/search-plus-${width}.png` })
    await page.keyboard.press('Enter')
    assert.equal(await dialog.getByRole('button', { name: 'shift', exact: true }).getAttribute('aria-pressed'), 'true')
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    const expected = rules.map((rule, index) => index === 1 ? { ...rule, toKey: 'equal_sign', toModifiers: ['shift'] } : rule)
    assert.deepEqual(await savedRules(), expected)
    assert.equal(await key.locator('.key-main').innerText(), '+')
    assert.equal(await key.evaluate(el => el === document.activeElement), true)
    await page.keyboard.press('Enter'); await picker().waitFor()
    assert.match(await picker().innerText(), /\+ · plus/)
    await settle(); await page.screenshot({ path: `${output}/reopened-plus-${width}.png` })
    await picker().click(); await search.fill('equal_sign'); await page.keyboard.press('Enter')
    assert.equal(await dialog.getByRole('button', { name: 'shift', exact: true }).getAttribute('aria-pressed'), 'false')
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    assert.deepEqual(await savedRules(), rules.map((rule, index) => index === 1 ? { ...rule, toKey: 'equal_sign' } : rule))
    assert.equal(await key.locator('.key-main').innerText(), '=')
    await page.keyboard.press('Enter'); await picker().click(); await search.fill('plus')
    await page.getByRole('dialog', { name: 'Key', exact: true }).getByRole('button', { name: '+ · plus', exact: true }).click()
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    assert.deepEqual(await savedRules(), expected)
    await settle(); await page.screenshot({ path: `${output}/board-plus-${width}.png` })
    await page.getByRole('tab', { name: 'Layer 0: Base', exact: true }).click()
    await page.getByRole('group', { name: 'MacBook keyboard' }).locator('[title^="spacebar:"]').click()
    await page.getByRole('dialog', { name: 'Edit binding spacebar', exact: true }).locator('button[aria-label="Key"]').click()
    await search.fill('+')
    assert.equal(await page.getByRole('button', { name: '+ · plus', exact: true }).count(), 0)
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    const calls = await page.evaluate(() => window.__nativeCalls)
    assert(calls.every(command => command === 'native_remapping_status')); assert.deepEqual(errors, [])
    results.push({ width, literalAndNamedSearch: true, physicalVLayer1CanonicalPlus: true, reopenedSymbol: true, rawBaseUnshifted: true, metadataOrderAndComboPreserved: true, tapAliasesAbsent: true, noRuntimeApply: true })
    await context.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify({ output, results }))
} finally { await browser.close() }
