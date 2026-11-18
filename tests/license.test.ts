import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { checkLicense, signLicense, toBase64Url, fromBase64Url, KEY_PREFIX, PRO_PRODUCT, type LicensePayload } from '@/lib/license/license'
import { canUse, FREE_FEATURES, PRO_FEATURES, isProFeature, type Feature } from '@/lib/license/features'
import { VENDOR } from '@/lib/license/vendor'

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair
const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
const now = new Date('2026-11-17T12:00:00Z')
const base: LicensePayload = { v: 1, product: PRO_PRODUCT, email: 'test@example.com', id: 'order-1', issued: '2026-11-17' }
const make = (p: Partial<LicensePayload> = {}) => signLicense({ ...base, ...p }, pair.privateKey)
const check = (key: string) => checkLicense(key, { publicKey, now })

/** Signed with the dev key whose public half ships in the app (scripts/license-key.ts issue). */
const SHIPPED_KEY = 'UK1-eyJ2IjoxLCJwcm9kdWN0IjoidWstcHJvIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWQiOiJ0MSIsImlzc3VlZCI6IjIwMjYtMTEtMTgifQ.25GMubdn4-TqaiYwpkzfjJtnT0T-nFmnNt1CcXaenzCUoV1AYY0GPwjCo4Zf51j0BIYZARes8fjzZVzozztSCQ'

describe('license key check', () => {
  test('a valid key unlocks and returns its buyer', async () => {
    const r = await check(await make())
    expect(r).toEqual({ ok: true, license: base })
  })

  test('the app public key accepts a key from the dev script', async () => {
    const r = await checkLicense(SHIPPED_KEY, { now })
    expect(r.ok).toBe(true)
  })

  test('line breaks and spaces from email are ignored', async () => {
    const key = await make()
    const wrapped = ` ${key.slice(0, 30)}\n${key.slice(30, 70)}\r\n${key.slice(70)} `
    expect((await check(wrapped)).ok).toBe(true)
  })

  test('an edited payload with the old signature is refused', async () => {
    const key = await make()
    const [, sig] = key.slice(KEY_PREFIX.length).split('.')
    const forged = new TextEncoder().encode(JSON.stringify({ ...base, email: 'thief@example.com' }))
    const r = await check(`${KEY_PREFIX}${toBase64Url(forged)}.${sig}`)
    expect(r).toMatchObject({ ok: false, problem: 'signature' })
  })

  test('one changed signature byte is refused', async () => {
    const key = await make()
    const [body, sig] = key.slice(KEY_PREFIX.length).split('.')
    const bytes = fromBase64Url(sig)!
    bytes[10] ^= 1
    const r = await check(`${KEY_PREFIX}${body}.${toBase64Url(bytes)}`)
    expect(r).toMatchObject({ ok: false, problem: 'signature' })
  })

  test('a key signed by another private key is refused', async () => {
    const other = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair
    const r = await check(await signLicense(base, other.privateKey))
    expect(r).toMatchObject({ ok: false, problem: 'signature' })
  })

  test('a test key is refused by the shipped public key', async () => {
    const r = await checkLicense(await make(), { now })
    expect(r).toMatchObject({ ok: false, problem: 'signature' })
  })

  test('a key for another product is refused', async () => {
    const r = await check(await make({ product: 'uk-other' }))
    expect(r).toMatchObject({ ok: false, problem: 'product' })
  })

  test('an expired key is refused with its date; a future one works', async () => {
    const r = await check(await make({ expires: '2026-11-01T00:00:00.000Z' }))
    expect(r).toMatchObject({ ok: false, problem: 'expired' })
    if (!r.ok) expect(r.message).toContain('2026-11-01')
    expect((await check(await make({ expires: '2027-11-01T00:00:00.000Z' }))).ok).toBe(true)
  })

  test('a signed payload with missing fields is refused', async () => {
    const body = new TextEncoder().encode(JSON.stringify({ v: 1, product: PRO_PRODUCT }))
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, body))
    const r = await check(`${KEY_PREFIX}${toBase64Url(body)}.${toBase64Url(sig)}`)
    expect(r).toMatchObject({ ok: false, problem: 'format' })
  })

  test.each(['', '   ', 'hello', 'UK1-', 'UK1-abc', 'UK1-a.b.c', 'UK1-!!!.???', 'UK2-abc.def'])('junk %p is refused, never thrown', async (junk) => {
    const r = await check(junk)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(['empty', 'format']).toContain(r.problem)
  })
})

describe('Pro gate', () => {
  const license = base
  const free = Object.keys(FREE_FEATURES) as Feature[]
  const pro = Object.keys(PRO_FEATURES) as Feature[]

  test('every free feature stays free with no key', () => {
    for (const f of free) expect(canUse(f, null)).toBe(true)
  })

  test('every Pro feature needs a key, and a key unlocks it', () => {
    for (const f of pro) {
      expect(canUse(f, null)).toBe(false)
      expect(canUse(f, license)).toBe(true)
    }
  })

  test('Pro is exactly the facts.md list and shares nothing with free', () => {
    expect(pro.sort()).toEqual(['one-layout', 'per-app-layers', 'phone-typing', 'sync'])
    for (const f of free) expect(isProFeature(f)).toBe(false)
  })

  test('the free list covers everything facts.md calls free', () => {
    const facts = readFileSync(new URL('../marketing/facts.md', import.meta.url), 'utf8')
    const freeRow = facts.split('\n').find(l => l.startsWith('| Ultimate Keyboards (free)'))!
    for (const word of ['home-row mods', 'layers', 'combos', 'Hyper', 'layer overlay', 'health panel', 'ZMK/QMK editing', 'flashing']) {
      expect(freeRow).toContain(word)
    }
    expect(free).toEqual(['home-row-mods', 'layers', 'combos', 'hyper-caps', 'layer-overlay', 'health-panel', 'zmk-qmk-editing', 'firmware-flashing'])
  })

  test('no seller is wired: no checkout link and no network call in the license code', () => {
    expect(VENDOR).toEqual({ name: 'none', checkoutUrl: null })
    for (const f of ['license.ts', 'features.ts', 'vendor.ts', 'store.ts', 'publicKey.ts']) {
      const src = readFileSync(new URL(`../src/lib/license/${f}`, import.meta.url), 'utf8')
      expect(src).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\/|paddle\.com|lemonsqueezy\.com/i)
    }
  })
})
