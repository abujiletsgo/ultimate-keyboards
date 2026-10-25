import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5186'
const output = process.env.VISUAL_OUTPUT || '/tmp/uk-shared-binding'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [800, 1200, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 800 ? 600 : 900 }, reducedMotion: 'reduce' })
    const errors = []; page.on('pageerror', error => errors.push(String(error)))
    await page.goto(`${baseURL}/tests/visual/shared-binding-fixture.html`)
    for (const [firmware, query, expected] of [['ZMK', 'LG(LS(N4))', '&kp LG(LS(N4))'], ['QMK', 'KC_ESC', 'KC_ESC']]) {
      const opener = page.getByRole('button', { name: `Edit ${firmware}`, exact: true })
      await opener.focus(); await page.keyboard.press('Enter')
      const shell = page.getByRole('dialog', { name: /Edit binding/ })
      await page.waitForFunction(() => document.activeElement?.closest('.binding-editor') !== null)
      await shell.getByRole('button', { name: 'Key', exact: true }).click()
      await shell.getByRole('button', { name: 'Choose a value', exact: true }).click()
      const search = page.getByRole('textbox', { name: 'Search Choose a value', exact: true })
      await search.focus(); await page.keyboard.press('Shift+Tab')
      assert.equal(await page.getByRole('dialog', { name: 'Choose a value', exact: true }).evaluate(el => el.contains(document.activeElement)), true)
      await page.keyboard.press('Tab')
      assert.equal(await search.evaluate(el => el === document.activeElement), true)
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: 'Choose a value', exact: true }).waitFor({ state: 'hidden' })
      assert.equal(await shell.isVisible(), true)
      assert.equal(await shell.getByRole('button', { name: 'Choose a value', exact: true }).evaluate(el => el === document.activeElement), true)
      await page.keyboard.press('Enter')
      await search.fill(query)
      await page.keyboard.press('Enter')
      await page.getByRole('dialog', { name: 'Choose a value', exact: true }).waitFor({ state: 'hidden' })
      await page.screenshot({ path: `${output}/${firmware.toLowerCase()}-${width}.png` })
      await shell.getByRole('button', { name: 'Apply', exact: true }).click()
      assert.equal(await page.getByLabel(`${firmware} binding`, { exact: true }).innerText(), expected)
      assert.equal(await opener.evaluate(el => el === document.activeElement), true)
      results.push({ width, firmware, serialized: expected, focusRestored: true })
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify({ output, results }))
} finally { await browser.close() }
