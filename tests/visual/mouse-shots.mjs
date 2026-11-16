// Screenshots of Scroll & Mouse: PLAYWRIGHT_MODULE=... VISUAL_BASE_URL=http://127.0.0.1:5187 node tests/visual/mouse-shots.mjs
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:5187'
const output = process.env.VISUAL_OUTPUT || '/Volumes/Work/tmp/uk-smooth-ui'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const os of ['mac', 'windows']) for (const [width, height] of [[1280, 800], [820, 1100], [390, 844]]) for (const on of ['1', '0']) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
    const errors = []; page.on('pageerror', e => errors.push(String(e)))
    await page.goto(`${baseURL}/tests/visual/mouse-fixture.html?os=${os}&on=${on}`)
    await page.getByText('Smooth scrolling').waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${output}/${os}-${width}-dark-${on === '1' ? 'on' : 'off'}.png` })
    if (errors.length) throw new Error(errors.join('\n'))
    await page.close()
  }
} finally { await browser.close() }
