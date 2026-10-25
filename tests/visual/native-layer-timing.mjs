// Isolated Vite/browser fixture. No Tauri, permission, or HID commands.
// PLAYWRIGHT_MODULE=/absolute/path/playwright/index.mjs node tests/visual/native-layer-timing.mjs
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.VISUAL_OUTPUT || '/tmp/uk-native-layer-timing'
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5186'
await mkdir(output, { recursive: true })
const original = {
  type: 'layer_activator', description: 'Space navigation layer', fromKey: 'spacebar', layerName: 'nav', tapKey: 'spacebar',
  editorMetadata: { note: 'preserve this field' },
}
const binding = { type: 'layer_binding', description: 'Nav H left', layerName: 'nav', fromKey: 'h', toKey: 'left_arrow' }
const before = { type: 'simple', description: 'A to B', fromKey: 'a', toKey: 'b' }
const after = { type: 'combo', description: 'JK Escape', fromKeys: ['j', 'k'], toKey: 'escape' }
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 600 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    await context.addInitScript(({ original, binding, before, after }) => {
      localStorage.setItem('uk.activeSection', 'karabiner')
      localStorage.setItem('uk.karabiner', JSON.stringify({ state: { rules: [before, original, binding, after], profileTitle: 'Layer timing fixture' }, version: 0 }))
    }, { original, binding, before, after })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(baseURL)
    const key = page.getByRole('group', { name: 'MacBook keyboard' }).locator('[title^="spacebar:"]')
    const open = async () => {
      await key.focus()
      await page.keyboard.press('Enter')
      await page.getByRole('dialog', { name: 'Edit binding spacebar', exact: true }).waitFor()
      await page.getByRole('dialog', { name: 'Edit binding spacebar', exact: true }).getByRole('button', { name: 'Tap/Hold', exact: true }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => document.activeElement?.closest('.binding-editor') !== null)
    }
    const savedRules = () => page.evaluate(() => JSON.parse(localStorage.getItem('uk.karabiner')).state.rules)
    await open()
    const layerPicker = page.getByRole('dialog', { name: 'Edit binding spacebar', exact: true }).getByRole('button', { name: 'Layer', exact: true })
    await layerPicker.focus(); await page.keyboard.press('Enter')
    const layerSearch = page.getByRole('textbox', { name: 'Search Layer', exact: true })
    await layerSearch.focus(); await page.keyboard.press('Shift+Tab')
    assert.equal(await page.getByRole('dialog', { name: 'Layer', exact: true }).evaluate(el => el.contains(document.activeElement)), true)
    await page.keyboard.press('Tab')
    assert.equal(await layerSearch.evaluate(el => el === document.activeElement), true)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Layer', exact: true }).waitFor({ state: 'hidden' })
    assert.equal(await layerPicker.evaluate(el => el === document.activeElement), true)
    const timing = page.getByRole('group', { name: 'Native layer timing', exact: true })
    const selectedPolicy = () => timing.locator('input:checked').inputValue()
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await selectedPolicy(), 'balanced')
    await timing.locator('input:checked').focus()
    await settle()
    await page.screenshot({ path: `${output}/balanced-${viewport.width}.png` })
    await timing.locator('input:checked').focus()
    assert.equal(await timing.locator('input:checked').evaluate(el => document.activeElement === el), true, await page.evaluate(() => document.activeElement?.outerHTML))
    await page.keyboard.press('ArrowDown')
    await settle()
    await page.keyboard.press('Tab')
    assert.equal(await selectedPolicy(), 'hold_preferred')
    assert.equal(await page.getByText(/rolling taps can become layer chords/).count(), 1)
    await settle()
    await page.screenshot({ path: `${output}/fast-chord-${viewport.width}.png` })
    await page.getByRole('dialog', { name: 'Edit binding spacebar', exact: true }).getByRole('button', { name: 'Apply', exact: true }).click()
    let rules = await savedRules()
    assert.deepEqual(rules, [before, { ...original, holdBehavior: 'hold_preferred' }, binding, after])
    assert.equal(await key.evaluate(el => document.activeElement === el), true)
    await open()
    assert.equal(await selectedPolicy(), 'hold_preferred')
    await timing.locator('input:checked').focus()
    await timing.locator('input:checked').focus()
    assert.equal(await timing.locator('input:checked').evaluate(el => document.activeElement === el), true, await page.evaluate(() => document.activeElement?.outerHTML))
    await page.keyboard.press('ArrowDown')
    await settle()
    await page.keyboard.press('Tab')
    assert.equal(await selectedPolicy(), 'tap_preferred')
    await page.getByRole('dialog', { name: 'Edit binding spacebar', exact: true }).getByRole('button', { name: 'Apply', exact: true }).click()
    await open()
    assert.equal(await selectedPolicy(), 'tap_preferred')
    await page.getByRole('button', { name: 'Hold Layer', exact: true }).click()
    assert.equal(await timing.count(), 0)
    assert.equal(await page.getByText(/Immediate while held/).count(), 1)
    const dialog = page.getByRole('dialog')
    await settle()
    const bounds = await dialog.boundingBox()
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height)
    await settle()
    await page.screenshot({ path: `${output}/immediate-${viewport.width}.png` })
    await page.getByRole('dialog', { name: 'Edit binding spacebar', exact: true }).getByRole('button', { name: 'Apply', exact: true }).click()
    rules = await savedRules()
    assert.equal(rules.length, 4)
    assert.equal(rules[1].tapKey, undefined)
    assert.equal(rules[1].holdBehavior, undefined) // obsolete dual-role field removed
    assert.deepEqual(rules[1].editorMetadata, original.editorMetadata)
    assert.deepEqual(rules[0], before)
    assert.deepEqual(rules[2], binding)
    assert.deepEqual(rules[3], after)
    // New dual-role layer starts Balanced; keyboard-search selects its tap key.
    await page.getByRole('group', { name: 'MacBook keyboard' }).locator('[title^="caps_lock:"]').click()
    await page.getByRole('button', { name: 'Tap/Hold', exact: true }).click()
    await page.getByRole('dialog', { name: 'Edit binding caps_lock', exact: true }).locator('button[aria-label="Key"]').click()
    await page.getByRole('textbox', { name: 'Search Key', exact: true }).fill('spacebar')
    await page.keyboard.press('Enter')
    assert.equal(await selectedPolicy(), 'balanced')
    await page.getByRole('dialog', { name: 'Edit binding caps_lock', exact: true }).getByRole('button', { name: 'Apply', exact: true }).click()
    rules = await savedRules()
    assert.equal(rules.length, 5)
    assert.equal(rules[4].holdBehavior, 'balanced')
    assert.equal(rules[4].tapKey, 'spacebar')
    assert.equal(rules[4].fromKey, 'caps_lock')
    assert.deepEqual(errors, [])
    results.push({ viewport, defaultBalanced: true, keyboardSelect: true, allPoliciesRoundTrip: true,
      taplessImmediateCopy: true, unknownFieldsPreserved: true, ruleOrderPreserved: true, namedLayerPicker: true, focusRestored: true, nestedPickerEscapeAndTab: true, dialogWithinViewport: true })
    await context.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ output, results }, null, 2))
} finally { await browser.close() }
