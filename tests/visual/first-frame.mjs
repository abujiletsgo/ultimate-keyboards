// First-frame check (Studio Decisions #77): with every animation frozen at its
// first frame (an entrance that never runs: hidden window, tray, dropped
// frames), the app's content must still be fully visible, and switching
// sections must draw the new section in the next frame (no skeleton once the
// section code is loaded). Fails on the pre-fix code (entrances from opacity 0).
//
//   bunx vite --port 5187 &   # web build, isolated browser storage
//   PLAYWRIGHT_MODULE=/abs/playwright/index.mjs VISUAL_BASE_URL=http://127.0.0.1:5187 node tests/visual/first-frame.mjs
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5187'

const browser = await chromium.launch({ headless: true })
const failures = []
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 600 }]) {
    const context = await browser.newContext({ viewport })
    await context.addInitScript(() => { localStorage.setItem('uk.activeSection', 'karabiner') })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    // Freeze every CSS/Web animation at time 0 before the app starts.
    const cdp = await context.newCDPSession(page)
    await cdp.send('Animation.enable')
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
    await page.goto(baseURL)
    await page.locator('.nav-item').first().waitFor()
    await page.locator('main.app-main > *').first().waitFor()
    await page.waitForTimeout(800) // section chunks preload (App preloadSections)

    // Least visible part of what a person sees: effective opacity (product of
    // ancestors) and transform scale of nav items and the section's content.
    const hidden = () => page.evaluate(() => {
      const opacity = el => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
      const scale = el => { const m = getComputedStyle(el).transform; if (!m || m === 'none') return 1; const v = m.match(/matrix\(([^)]+)\)/); return v ? Math.hypot(...v[1].split(',').slice(0, 2).map(Number)) : 1 }
      const targets = [...document.querySelectorAll('.nav-item, main.app-main h1, main.app-main h2, main.app-main h3, main.app-main .section-title, main.app-main button, main.app-main [role=tab]')]
        .filter(e => e.getClientRects().length > 0 && !e.matches(':disabled, [aria-disabled=true]')) // disabled controls dim on purpose
      const bad = targets.map(e => ({ text: (e.textContent || '').trim().slice(0, 30), opacity: +opacity(e).toFixed(2), scale: +scale(e).toFixed(2) }))
        .filter(t => t.opacity < 0.99 || t.scale < 0.5)
      const skeletons = [...document.querySelectorAll('main.app-main .skeleton')].filter(e => e.getClientRects().length > 0).length
      return { checked: targets.length, bad: bad.slice(0, 5), skeletons }
    })
    const nextFrame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))

    const record = (step, r) => {
      if (r.checked === 0) failures.push(`${viewport.width}px ${step}: nothing to check`)
      if (r.bad.length) failures.push(`${viewport.width}px ${step}: hidden in first frame ${JSON.stringify(r.bad)}`)
      if (r.skeletons) failures.push(`${viewport.width}px ${step}: ${r.skeletons} skeleton(s) after its code was loaded`)
      console.log(`${viewport.width}px ${step}: checked ${r.checked}, hidden ${r.bad.length}, skeletons ${r.skeletons}`)
    }
    record('launch', await hidden())
    for (const name of ['Scroll & Mouse', 'Settings', 'MacBook Keys']) {
      await page.locator('.nav-item', { hasText: name }).first().click()
      await nextFrame()
      record(name, await hidden())
    }
    assert.deepEqual(errors, [], `page errors at ${viewport.width}px`)
    await context.close()
  }
} finally {
  await browser.close()
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log('first frame: every checked element visible')
