// Browser-only customer setup fixtures: all platform actions mocked, no live permissions/HID.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5186'
const output = process.env.VISUAL_OUTPUT || '/tmp/uk-customer-journey'
await mkdir(output, { recursive: true })
const missing = { state: 'not_installed', message: 'Install the bundled service.', driverReady: false, inputMonitoringGranted: false, helperInstalled: false, enabled: false, capturedDevices: 0, protocolVersion: 1 }
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [800, 1200]) {
    const viewport = { width, height: width === 800 ? 600 : 800 }
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    await context.addInitScript(missing => { window.__status = missing; window.__calls = [] }, missing)
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)))
    await page.route('**/src/lib/nativeRemapping.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()) + `\nObject.assign(nativeRemapping,createNativeRemappingController({available:true,invoke:async command=>{window.__calls.push(command);if(command==='native_remapping_status'||command==='native_remapping_refresh_permissions')return window.__status;if(command==='native_remapping_install')return 'Installer opened. Complete macOS authorization, then check status.';if(command==='native_remapping_open_settings')return;if(command==='native_remapping_activate_driver')return 'Follow macOS driver approval prompts.';throw new Error('Unexpected runtime action: '+command)}}));window.__refresh=()=>nativeRemapping.refresh();` })
    })
    await page.goto(baseURL)
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const welcome = page.getByRole('button', { name: /Remap this MacBook/ })
    await welcome.waitFor(); await settle(); await page.screenshot({ path: `${output}/welcome-${width}.png` })
    await welcome.focus(); await page.keyboard.press('Enter')
    await page.getByRole('tab', { name: 'Remapping', exact: true }).click()
    assert.match(await page.evaluate(() => localStorage.getItem('uk.activeSection')), /karabiner/)
    assert.equal(await page.getByRole('button', { name: 'Input Monitoring', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Check status', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: 'Apply and enable', exact: true }).isDisabled(), true)
    await settle(); await page.screenshot({ path: `${output}/install-${width}.png` })
    await page.getByRole('button', { name: 'Install native components', exact: true }).click()
    await page.getByText(/Installer opened\. Complete macOS/).waitFor()
    await page.evaluate(async () => { window.__status = { ...window.__status, state: 'needs_permission', helperInstalled: true, message: 'Allow Ultimate Keyboards Remapper in Input Monitoring.' }; await window.__refresh() })
    await page.getByText(/Allow Ultimate Keyboards Remapper in System Settings/).waitFor()
    assert.equal(await page.getByText(/Fumihiko Takayama \(pqrs.org\)/).count(), 1)
    await page.getByRole('button', { name: 'Input Monitoring', exact: true }).click()
    await settle(); await page.screenshot({ path: `${output}/permission-${width}.png` })
    await page.evaluate(async () => { window.__status = { ...window.__status, state: 'driver_unavailable', inputMonitoringGranted: true, message: 'Complete macOS driver approval, then retry Apply.' }; await window.__refresh() })
    await page.getByRole('button', { name: 'Activate keyboard driver', exact: true }).click()
    await page.getByRole('button', { name: 'Check status', exact: true }).click()
    await page.evaluate(async () => { window.__status = { ...window.__status, state: 'stopped', message: 'Service ready for an explicit Apply; keyboard capture is stopped.' }; await window.__refresh() })
    await page.getByText(/Add a rule or load an example in Keymap/).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Apply and enable', exact: true }).isDisabled(), true)
    const setup = page.getByText('Native setup and profile', { exact: true })
    if (!(await setup.evaluate(el => el.parentElement.open))) await setup.click()
    assert.equal(await page.getByRole('button', { name: 'Install native components', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Repair native components', exact: true }).isVisible(), true)
    await settle(); await page.screenshot({ path: `${output}/empty-ready-${width}.png` })
    await page.getByRole('tab', { name: 'Combos', exact: true }).click()
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const board = page.getByRole('group', { name: 'MacBook keyboard' })
    await board.locator('[title="fn"]').click()
    await page.getByRole('alert').filter({ hasText: 'Fn and Touch ID cannot be combo triggers' }).waitFor()
    assert.equal(await board.getByRole('button', { pressed: true }).count(), 0)
    await board.locator('[title="w"]').click(); await board.locator('[title="e"]').click()
    await page.getByRole('button', { name: 'Combo output key', exact: true }).click()
    await page.getByRole('textbox', { name: 'Search Combo output key', exact: true }).fill('+')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Add Combo', exact: true }).click()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('uk.karabiner')).state.rules)
    assert.equal(saved.length, 1)
    assert.deepEqual({ type: saved[0].type, fromKeys: saved[0].fromKeys, toKey: saved[0].toKey, toModifiers: saved[0].toModifiers }, { type: 'combo', fromKeys: ['w', 'e'], toKey: 'equal_sign', toModifiers: ['shift'] })
    const surround = [
      { type: 'simple', description: 'Control Q', fromKey: 'q', fromModifiers: ['control'], toKey: 'escape' },
      { ...saved[0], metadata: { retain: true } },
      { type: 'layer_binding', description: 'Nav H', fromKey: 'h', layerName: 'nav', toKey: 'left_arrow' },
    ]
    await page.evaluate(async rules => { const { useKarabinerStore } = await import('/src/stores/karabinerStore.ts'); useKarabinerStore.getState().replaceRules(rules) }, surround)
    await page.locator('[data-combo-row="1"]').waitFor()
    await settle()
    const editCombo = page.getByRole('button', { name: 'Edit combo w + e', exact: true })
    await editCombo.focus(); await page.keyboard.press('Enter')
    await page.getByText('Edit Combo', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Combo output key', exact: true }).click()
    await page.getByRole('textbox', { name: 'Search Combo output key', exact: true }).fill('?')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    const edited = await page.evaluate(() => JSON.parse(localStorage.getItem('uk.karabiner')).state.rules)
    assert.deepEqual(edited[0], surround[0]); assert.deepEqual(edited[2], surround[2])
    assert.deepEqual(edited[1].metadata, surround[1].metadata)
    assert.equal(edited[1].toKey, 'slash'); assert.deepEqual(edited[1].toModifiers, ['shift'])
    const calls = await page.evaluate(() => window.__calls)
    assert.deepEqual(calls.filter(command => command !== 'native_remapping_status'), ['native_remapping_install', 'native_remapping_open_settings', 'native_remapping_activate_driver', 'native_remapping_refresh_permissions'])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    await context.close()
    // Actual App/Settings layout; only Updates and openGithub receive the desktop branch.
    // Other app modules remain browser-only, so no registry, permission, or HID calls occur.
    const updateContext = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    await updateContext.addInitScript(() => { window.__calls = []; localStorage.setItem('uk.activeSection', 'settings') })
    const updatePage = await updateContext.newPage()
    for (const module of ['**/src/components/Settings/Updates.tsx*', '**/src/lib/openUrl.ts*']) {
      await updatePage.route(module, async route => {
        const response = await route.fetch(); const source = await response.text()
        const body = source.replace(/import \{ IS_TAURI \} from [^;]+;/, 'const IS_TAURI = true;')
        assert.notEqual(body, source, 'Desktop branch fixture must match the actual module import')
        await route.fulfill({ response, body })
      })
    }
    await updatePage.goto(baseURL)
    await updatePage.getByRole('tab', { name: 'Updates', exact: true }).click()
    const downloads = updatePage.getByRole('button', { name: 'Open complete installer downloads', exact: true })
    await downloads.waitFor()
    assert.deepEqual(await updatePage.evaluate(() => window.__calls), [])
    await updatePage.screenshot({ path: `${output}/updates-${width}.png` })
    const updateColors = await updatePage.getByText('Installed version', { exact: false }).evaluate(el => ({ color: getComputedStyle(el).color, body: getComputedStyle(document.body).color }))
    assert.equal(updateColors.color, 'rgba(244, 245, 255, 0.98)', 'Installed version inherits the actual App text token')
    assert.equal(updateColors.body, updateColors.color)
    await updatePage.evaluate(() => { window.__TAURI_INTERNALS__ = { invoke: async (command, args) => { window.__calls.push({ command, args }); if (command !== 'open_github_url') throw new Error('App-only updater must not run'); } } })
    await downloads.focus(); await updatePage.keyboard.press('Enter')
    assert.deepEqual(await updatePage.evaluate(() => window.__calls), [{ command: 'open_github_url', args: { url: 'https://github.com/abujiletsgo/ultimate-keyboards/releases/latest' } }])
    await updateContext.close()
    results.push({ width, onboardingMacBookWithoutRegistration: true, setupActionsExplicit: true, exactPermissionIdentity: true, emptyProfileActionable: true, healthyStoppedRepairLabel: true, comboCanonicalPlusAndFnRejected: true, noRuntimeApply: true, nativeUpdateOnlyCompleteInstaller: true, updateColors })
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify({ output, results }))
} finally { await browser.close() }
