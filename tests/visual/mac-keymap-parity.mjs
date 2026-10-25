// Render the real Mac editor with isolated saved rules and a mocked native status transport.
// PLAYWRIGHT_MODULE=/absolute/path/playwright/index.mjs node tests/visual/mac-keymap-parity.mjs
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.VISUAL_OUTPUT || '/tmp/uk-mac-keymap'
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5186'
await mkdir(output, { recursive: true })
const longLayer = 'Symbols_and_navigation_for_extended_workflows'
const rules = [
  { type: 'simple', description: 'A to B', fromKey: 'a', toKey: 'b' },
  { type: 'layer_binding', description: 'Nav A home', layerName: 'nav', fromKey: 'a', toKey: 'home' },
  { type: 'layer_binding', description: 'Nav H left', layerName: 'nav', fromKey: 'h', toKey: 'left_arrow', editorMetadata: { keep: true } },
  { type: 'layer_activator', description: 'Space navigation', fromKey: 'spacebar', tapKey: 'spacebar', layerName: 'nav', holdBehavior: 'hold_preferred' },
  { type: 'homerow_mod', description: 'F shift', fromKey: 'f', tapKey: 'f', modKey: 'left_shift' },
  { type: 'combo', description: 'JK Escape', fromKeys: ['j', 'k'], toKey: 'escape' },
  { type: 'layer_binding', description: 'Symbols Q', layerName: longLayer, fromKey: 'q', toKey: '1', toModifiers: ['shift'] },
  { type: 'simple', description: 'F3 Home', fromKey: 'f3', toKey: 'home' },
  { type: 'simple', description: 'ISO section escape', fromKey: 'iso_section', toKey: 'escape' },
]
const stopped = { state: 'stopped', message: 'Ready to apply explicitly.', driverReady: false, inputMonitoringGranted: true, helperInstalled: true, enabled: false, capturedDevices: 0, protocolVersion: 1 }
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1200, height: 800 }, { width: 800, height: 600 }].filter(size => !process.env.VISUAL_WIDTH || size.width === Number(process.env.VISUAL_WIDTH))) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    await context.addInitScript(({ rules, stopped }) => {
      localStorage.setItem('uk.activeSection', 'karabiner')
      localStorage.setItem('uk.karabiner', JSON.stringify({ state: { rules, profileTitle: 'MacBook navigation and productivity profile for extended workflows' }, version: 0 }))
      window.__nativeStatus = stopped
      window.__nativeCalls = []
      window.__refreshHooks = []
    }, { rules, stopped })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.route('**/src/lib/nativeRemapping.ts*', async route => {
      const response = await route.fetch()
      const body = await response.text()
      await route.fulfill({ response, body: body + `
Object.assign(nativeRemapping,createNativeRemappingController({available:true,invoke:async command=>{window.__nativeCalls.push(command);if(window.__allowFailures){if(command==='native_remapping_apply')throw new Error('Test apply rejected: permission required');if(command==='native_remapping_refresh_permissions')throw new Error('Test refresh rejected: helper unavailable');if(command==='native_remapping_disable'){window.__nativeStatus={...window.__nativeStatus,state:'stopped',enabled:false,capturedDevices:0};return window.__nativeStatus}if(command==='native_remapping_status'&&window.__failStatus)throw new Error('Test status disconnected')}if(command!=='native_remapping_status')throw new Error('Unexpected native action: '+command);return window.__nativeStatus}}));window.__refreshHooks.push(()=>nativeRemapping.refresh());
` })
    })
    await page.goto(baseURL)
    await page.getByRole('tab', { name: 'Keymap', exact: true }).waitFor()
    const board = page.getByRole('group', { name: 'MacBook keyboard' })
    await board.waitFor()
    const key = code => board.locator(`[title^="${code}:"]`)
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await settle()
    assert.equal(await key('a').locator('.key-main').innerText(), 'B')
    assert.equal(await key('f3').locator('.key-sub').count(), 0)
    await key('power').click()
    await page.getByRole('dialog', { name: 'Edit binding power', exact: true }).waitFor()
    assert.equal(await page.getByRole('dialog', { name: 'Edit binding power', exact: true }).getByRole('button', {name:'Apply',exact:true}).isDisabled(), true)
    await page.keyboard.press('Escape')
    assert.equal(await board.locator('.keycap[tabindex="0"]').count(), 1)
    const fontMetrics = await key('f').evaluate(el => { const scale = el.getBoundingClientRect().width / el.offsetWidth; return { scale, primary: parseFloat(getComputedStyle(el.querySelector('.key-main')).fontSize) * scale, secondary: parseFloat(getComputedStyle(el.querySelector('.key-sub')).fontSize) * scale } })
    assert.equal(await key('a').evaluate(el => el.style.getPropertyValue('--key-bg')), '')
    assert.equal(await key('f').evaluate(el => el.style.getPropertyValue('--key-text')), '#fdba74')
    await key('h').focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await key('j').evaluate(el => document.activeElement === el), true)
    await page.getByRole('tab', { name: 'Layer 0: Base', exact: true }).focus()
    await page.screenshot({ path: `${output}/base-${viewport.width}.png` })
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.getByRole('tab', { name: 'Layer 1: nav', exact: true }).getAttribute('aria-selected'), 'true')
    assert.equal(await key('h').locator('.key-main').innerText(), '←')
    assert.match(await key('a').getAttribute('title'), /earlier Base rule/)
    assert.match(await key('s').locator('.key-sub').innerText(), /pass/i)
    await settle()
    await page.screenshot({ path: `${output}/navigation-${viewport.width}.png` })
    await key('h').focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    await settle()
    assert.match(await dialog.textContent(), /Layer: nav/)
    await dialog.locator('button[aria-label="Key"]').click()
    await page.getByRole('textbox', { name: 'Search Key', exact: true }).fill('up_arrow')
    await page.keyboard.press('Enter')
    await settle()
    await page.screenshot({ path: `${output}/context-editor-${viewport.width}.png` })
    await page.getByRole('dialog', { name: 'Edit binding h', exact: true }).getByRole('button', { name: 'Apply', exact: true }).click()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('uk.karabiner')).state.rules)
    assert.deepEqual(saved, rules.map((rule, index) => index === 2 ? { ...rule, toKey: 'up_arrow' } : rule))
    assert.equal(await key('h').evaluate(el => document.activeElement === el), true)
    await page.getByRole('tab', { name: `Layer 2: ${longLayer}`, exact: true }).click()
    await settle()
    await page.screenshot({ path: `${output}/long-layer-${viewport.width}.png` })
    assert.equal(await key('q').locator('.key-main').innerText(), '!')
    await key('q').click()
    await page.getByRole('dialog').waitFor()
    await settle()
    assert.equal(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true)
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    // Deleting the last references to the selected layer returns the preview to Base.
    await page.evaluate(async longLayer => {
      const { useKarabinerStore } = await import('/src/stores/karabinerStore.ts')
      const state = useKarabinerStore.getState()
      useKarabinerStore.setState({ rules: state.rules.filter(rule => rule.layerName !== longLayer) })
    }, longLayer)
    await page.getByRole('tab', { name: 'Layer 0: Base', exact: true }).waitFor()
    assert.equal(await page.getByRole('tab', { name: 'Layer 0: Base', exact: true }).getAttribute('aria-selected'), 'true')
    await page.getByText(/Ordered rules \(/).click()
    assert.equal(await page.getByText(/Keys outside this US ANSI diagram/).count(), 1)
    await page.getByText(/Keys outside this US ANSI diagram/).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/missing-key-${viewport.width}.png` })
    await page.getByText(/Ordered rules \(/).click()
    await page.getByRole('tab', { name: 'Remapping', exact: true }).click()
    // Mocked transport only: permission and running states do not open or seize a device.
    for (const [name, patch] of [['permission', { state: 'needs_permission', inputMonitoringGranted: false, message: 'Allow the native helper in Input Monitoring.' }], ['running', { state: 'running', enabled: true, driverReady: true, capturedDevices: 1, profileTitle: 'Previously applied keymap', message: 'Capturing one keyboard.' }]]) {
      await page.evaluate(async ({ patch, stopped }) => {
        window.__nativeStatus = { ...stopped, ...patch }
        await Promise.all(window.__refreshHooks.map(refresh => refresh()))
      }, { patch, stopped })
      await page.locator('#mac-keys-editor').evaluate(el => { el.parentElement.scrollTop = 0 })
      await settle()
      if (name === 'permission') {
        assert.equal(await page.getByRole('button', { name: 'Input Monitoring', exact: true }).isVisible(), true)
        assert.equal(await page.getByRole('button', { name: 'Apply and enable', exact: true }).isDisabled(), true)
      } else {
        assert.match(await page.getByRole('button', { name: 'Stop remapping', exact: true }).getAttribute('class'), /btn-danger/)
      }
      await page.screenshot({ path: `${output}/${name}-${viewport.width}.png` })
    }
    const beforeActions = await page.evaluate(() => window.__nativeCalls)
    assert(beforeActions.every(command => command === 'native_remapping_status'))
    await page.evaluate(() => { window.__allowFailures = true })
    await page.getByRole('button', { name: 'Apply current rules', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Test apply rejected' }).waitFor()
    assert.equal(await page.getByRole('alert').filter({ hasText: 'Test apply rejected' }).evaluate(el => el.closest('details') === null), true)
    await page.getByRole('button', { name: 'Stop remapping', exact: true }).click()
    const setup = page.getByText('Native setup and profile', { exact: true })
    if (!(await setup.evaluate(el => el.parentElement.open))) await setup.click()
    await page.getByRole('button', { name: 'Check status', exact: true }).click()
    try { await page.getByRole('alert').filter({ hasText: 'Test refresh rejected' }).waitFor({ timeout: 5000 }) } catch (error) {
      console.error(await page.evaluate(() => ({ calls: window.__nativeCalls, allow: window.__allowFailures, text: document.body.innerText })))
      throw error
    }
    assert.equal(await page.getByRole('alert').filter({ hasText: 'Test refresh rejected' }).evaluate(el => el.closest('details') === null), true)
    await page.evaluate(async () => { window.__failStatus = true; await Promise.all(window.__refreshHooks.map(refresh => refresh())) })
    await page.getByText('Status unavailable', { exact: true }).waitFor()
    assert.equal(await page.getByText(/Running ·/).count(), 0)
    await page.screenshot({ path: `${output}/status-error-${viewport.width}.png` })
    await page.evaluate(async stopped => { window.__failStatus = false; window.__nativeStatus = stopped; await Promise.all(window.__refreshHooks.map(refresh => refresh())) }, stopped)
    await page.evaluate(async () => {
      const { useKarabinerStore } = await import('/src/stores/karabinerStore.ts')
      useKarabinerStore.setState({ rules: [] })
    })
    await page.getByRole('tab', { name: 'Keymap', exact: true }).click()
    assert.equal(await page.getByRole('tablist', { name: 'MacBook layers' }).getByRole('tab').count(), 1)
    assert.equal(await page.getByRole('button', { name: 'Load example profile', exact: true }).isVisible(), true)
    await settle()
    await page.screenshot({ path: `${output}/empty-${viewport.width}.png` })
    const calls = await page.evaluate(() => window.__nativeCalls)
    assert.deepEqual(calls.filter(command => command !== 'native_remapping_status'), ['native_remapping_apply', 'native_remapping_disable', 'native_remapping_refresh_permissions'])
    assert.deepEqual(errors, [])
    results.push({ viewport, fontMetrics, physicalNavigation: true, contextualEdit: true, unknownFieldsAndOrderPreserved: true,
      conflictDisclosed: true, layerRemovalFallsBackToBase: true, noApplyDuringEdits: true, stopOnlyDisables: true, errorsVisibleOutsideDetails: true, staleRunningCleared: true, nativeCalls: [...new Set(calls)], states: ['base', 'navigation', 'long-layer', 'permission', 'running', 'empty', 'missing-key'] })
    await context.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ output, results }, null, 2))
} finally { await browser.close() }
