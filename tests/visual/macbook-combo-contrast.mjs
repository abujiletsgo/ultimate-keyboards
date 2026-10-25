// Run with a Vite server and an existing Playwright install:
// PLAYWRIGHT_MODULE=/absolute/path/playwright/index.mjs node tests/visual/macbook-combo-contrast.mjs
// Isolated browser storage only; never connects to Tauri or changes the user's rules.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5186'
const output = process.env.VISUAL_OUTPUT || '/tmp/uk-combo-contrast'
await mkdir(output, { recursive: true })
const rules = [
  { type: 'combo', description: 'w+e → Escape', fromKeys: ['w', 'e'], toKey: 'escape' },
  { type: 'combo', description: 'i+o → Backspace', fromKeys: ['i', 'o'], toKey: 'delete_or_backspace' },
  { type: 'combo', description: 'o+p → Forward Delete', fromKeys: ['o', 'p'], toKey: 'delete_forward' },
  { type: 'combo', description: 's+d → Tab', fromKeys: ['s', 'd'], toKey: 'tab' },
  { type: 'combo', description: 'k+l → Enter', fromKeys: ['k', 'l'], toKey: 'return_or_enter' },
]
const browser = await chromium.launch({ headless: true })
const results = []
const errors = []
try {
  for (const viewport of [{ width: 1830, height: 1374 }, { width: 800, height: 600 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    await context.addInitScript(rules => {
      localStorage.setItem('uk.activeSection', 'karabiner')
      localStorage.setItem('uk.karabiner', JSON.stringify({ state: { rules, profileTitle: 'Combo contrast fixture' }, version: 0 }))
    }, rules)
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(baseURL)
    const combos = page.getByRole('tab', { name: 'Combos', exact: true })
    await combos.focus()
    await page.keyboard.press('Enter')
    const board = page.getByRole('group', { name: 'MacBook keyboard' })
    await board.waitFor()
    await page.locator('#mac-keys-editor').evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.mouse.move(0, 0)
    assert.equal(await board.locator('[data-combo-trigger]').count(), 9)
    assert.equal(await board.locator('[data-combo-active]').count(), 0)
    const colors = await board.locator('.keycap').evaluateAll(keys => keys.map(key => {
      const style = getComputedStyle(key)
      return { key: key.title, color: style.color, background: style.backgroundColor, image: style.backgroundImage,
        border: style.borderColor, opacity: style.opacity, disabled: key.disabled }
    }))
    assert(colors.every(key => key.opacity === '1' && key.disabled))
    assert(colors.find(key => key.key === 'o').image.includes('linear-gradient'))
    const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number)
    const luminance = value => rgb(value).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s,v,i) => s + v * [.2126,.7152,.0722][i], 0)
    const contrast = (a,b) => (Math.max(luminance(a),luminance(b)) + .05) / (Math.min(luminance(a),luminance(b)) + .05)
    const neutral = colors.find(key => key.key === 'a')
    const solidTriggers = colors.filter(key => key.image === 'none' && key.background !== neutral.background)
    const textContrasts = [contrast(neutral.color, neutral.background), ...solidTriggers.map(key => contrast(key.color, key.background))]
    const fillContrasts = solidTriggers.map(key => contrast(key.background, neutral.background))
    assert(Math.min(...textContrasts) >= 4.5)
    assert(Math.min(...fillContrasts) >= 3)
    await page.screenshot({ path: `${output}/idle-${viewport.width}x${viewport.height}.png` })
    // Keyboard focus on either action previews its row, with the same mapping as hover.
    await page.getByRole('button', { name: 'Edit combo i + o', exact: true }).focus()
    await page.keyboard.press('Tab')
    assert.equal(await page.getByRole('button', { name: 'Delete combo i + o', exact: true }).evaluate(el => el === document.activeElement), true)
    assert.deepEqual(await board.locator('[data-combo-active]').evaluateAll(keys => keys.map(key => key.title)), ['i', 'o'])
    await board.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/focus-${viewport.width}x${viewport.height}.png` })
    await page.getByRole('tab', { name: 'Combos', exact: true }).focus()
    await page.locator('[data-combo-row="2"]').hover()
    assert.deepEqual(await board.locator('[data-combo-active]').evaluateAll(keys => keys.map(key => key.title)), ['o', 'p'])
    await page.getByRole('button', { name: 'Edit combo w + e', exact: true }).click()
    const picker = page.getByRole('group', { name: 'MacBook keyboard' })
    assert.equal(await picker.getByRole('button', { pressed: true }).count(), 2)
    const w = picker.locator('[title="w"]')
    await w.focus()
    await page.keyboard.press('Space')
    assert.equal(await w.getAttribute('aria-pressed'), 'false')
    await page.keyboard.press('Space')
    assert.equal(await w.getAttribute('aria-pressed'), 'true')
    await picker.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/picker-${viewport.width}x${viewport.height}.png` })
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('uk.karabiner')).state.rules)
    assert.deepEqual(saved, rules)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(overflow, false)
    results.push({ viewport, triggerKeys: 9, sharedKey: 'o', minimumTextContrast: Math.min(...textContrasts), minimumFillContrastAgainstNeutral: Math.min(...fillContrasts), keyboardPreview: 'passed', pickerToggle: 'passed', rulesUnchanged: true, documentOverflow: overflow })
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/results.json`, JSON.stringify({ results, pageErrors: errors }, null, 2))
  console.log(JSON.stringify({ output, results }, null, 2))
} finally {
  await browser.close()
}
