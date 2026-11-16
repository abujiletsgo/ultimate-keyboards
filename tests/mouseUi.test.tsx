import { afterEach, describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import Mouse, { loadSaved } from '../src/components/Mouse'
import { setHostOS } from '../src/lib/platform'

const store = new Map<string, string>()
;(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
afterEach(() => { store.clear(); setHostOS('mac') })

describe('Scroll & Mouse config', () => {
  test('a saved config without smooth loads as smooth on', () => {
    store.set('uk.mouseConfig', JSON.stringify({ enabled: true, reverse: true, speed: 2 }))
    expect(loadSaved()).toEqual({ enabled: true, reverse: true, speed: 2, smooth: true })
  })
  test('an explicit smooth off stays off; no saved config is smooth on', () => {
    store.set('uk.mouseConfig', JSON.stringify({ smooth: false }))
    expect(loadSaved().smooth).toBe(false)
    store.clear()
    expect(loadSaved().smooth).toBe(true)
  })
})

describe('Scroll & Mouse page', () => {
  for (const os of ['windows', 'mac'] as const) {
    test(`${os}: all controls, no Mac-only note`, () => {
      setHostOS(os)
      const html = renderToStaticMarkup(<Mouse />)
      for (const t of ['Scroll &amp; Mouse', 'Smooth scrolling', 'Reverse direction', 'Speed']) expect(html).toContain(t)
      expect(html).not.toContain('only on the Mac')
      expect(html).toContain(os === 'windows' ? 'touchpad' : 'trackpad')
      expect(html).not.toContain(os === 'windows' ? 'trackpad' : 'touchpad')
    })
  }
})
