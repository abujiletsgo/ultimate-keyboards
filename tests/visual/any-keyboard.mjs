// Renders the any-custom-keyboard screens (tests/visual/any-keyboard-fixture.tsx) at phone,
// tablet and desktop widths, at rest, hovered and keyboard-focused; asserts text and no
// horizontal overflow. PLAYWRIGHT_MODULE=/path/to/playwright VISUAL_BASE_URL=http://127.0.0.1:5191
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5191'
const out = process.env.VISUAL_OUTPUT || '/tmp/uk-any-keyboard'
await mkdir(out, { recursive: true })
const WIDTHS = [[390, 844], [820, 1180], [1280, 900]]
const VIEWS = {
  find: { act: async p => { await p.getByLabel('Search keyboards').fill('keychron q1'); await p.getByText('3 more from QMK').waitFor() }, expect: ['3 more from QMK', 'keychron/q1v2/iso_encoder'], hover: 'button.card-btn' },
  'find-offline': { act: async p => { await p.getByLabel('Search keyboards').fill('planck'); await p.getByText(/needs an internet connection/).waitFor() }, expect: ['Planck', 'needs an internet connection'], hover: 'button.card-btn' },
  'add-qmk': { expect: ['QMK · keychron/q1v2/ansi_encoder', 'keymap has 82 keys per layer'], hover: 'button.btn-primary',
    after: async p => { if (await p.locator('input').first().inputValue() !== 'Keychron Q1v2 Ansi Encoder') throw new Error('name'); await p.getByRole('button', { name: 'Add keyboard' }).click(); await p.getByText('Added Keychron Q1v2 Ansi Encoder (qmk, 82 keys)').waitFor() } },
  'add-download': { after: async p => { await p.getByRole('button', { name: 'Add keyboard' }).click(); await p.getByText('Added Planck (qmk, 48 keys)').waitFor() }, act: async p => { await p.getByText(/QMK · LAYOUT_ortho_4x12/).waitFor({ state: 'attached' }) }, expect: ['planck/rev6', 'downloaded from QMK', 'keymap has 48 keys per layer'], hover: 'button.btn-primary' },
  'add-error': { expect: ['qmk c2json -kb crkbd/rev1 -km tom'], hover: 'button.btn-primary' },
  'build-qmk': { expect: ['qmk compile /Users/me/planck/keymap.json', 'qmk flash /Users/me/planck/keymap.json', 'Flash a .uf2 file'], hover: 'button.btn-secondary' },
  'build-via': { act: async p => { await p.getByRole('button', { name: 'Check what would change' }).click(); await p.getByText('2 keys differ:').waitFor() }, expect: ['Experimental', '2 keys differ:', 'KC_A → KC_Q', 'KC_SPC → LSFT_T(KC_SPC)', 'Write 2 keys'], hover: 'button.btn-primary',
    after: async p => { await p.getByRole('button', { name: 'Write 2 keys' }).click(); await p.getByText('Wrote and checked 2 keys.').waitFor() } },
}
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const [view, spec] of Object.entries(VIEWS)) for (const [w, h] of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' })
    const errors = []; page.on('pageerror', e => errors.push(String(e)))
    await page.goto(`${base}/tests/visual/any-keyboard-fixture.html?view=${view}`)
    await page.waitForLoadState('networkidle')
    if (spec.act) await spec.act(page)
    await page.waitForTimeout(300)
    const text = await page.locator('body').innerText()
    for (const t of spec.expect) assert.ok(text.toLowerCase().includes(t.toLowerCase()), `${view}@${w}: missing "${t}"`)
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(sw <= w, `${view}@${w}: horizontal overflow ${sw}px`)
    await page.screenshot({ path: `${out}/${view}-${w}-rest.png`, fullPage: true })
    const target = page.locator(spec.hover).first()
    await target.hover(); await page.screenshot({ path: `${out}/${view}-${w}-hover.png` })
    await target.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab')
    const focusVisible = await page.evaluate(() => { const el = document.activeElement; const cs = el && getComputedStyle(el); return !!el && el !== document.body && (cs.outlineStyle !== 'none' || cs.boxShadow !== 'none') })
    await page.screenshot({ path: `${out}/${view}-${w}-focus.png` })
    if (spec.after) await spec.after(page)
    assert.deepEqual(errors, [], `${view}@${w}: page errors`)
    results.push({ view, width: w, scrollWidth: sw, focusVisible })
    await page.close()
  }
} finally { await browser.close() }
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results))
