/**
 * Offline license keys for Ultimate Keyboards Pro.
 *
 * A key is `UK1-<payload>.<signature>`, both base64url. The payload is JSON
 * signed with Ed25519; the app holds only the public key, so checking a key
 * needs no network and a changed byte anywhere fails the signature.
 * Keys are made by scripts/license-key.ts with a private key kept out of git.
 */
import { LICENSE_PUBLIC_KEY } from './publicKey'

export const KEY_PREFIX = 'UK1-'
export const PRO_PRODUCT = 'uk-pro'

export interface LicensePayload {
  v: 1
  product: string
  /** who bought it, shown back on the Pro screen */
  email: string
  /** order or key id from the seller */
  id: string
  /** ISO date the key was made */
  issued: string
  /** ISO date after which the key stops working; absent for a one-time purchase */
  expires?: string
}

export type LicenseProblem = 'empty' | 'format' | 'signature' | 'product' | 'expired'

export type LicenseCheck =
  | { ok: true; license: LicensePayload }
  | { ok: false; problem: LicenseProblem; message: string }

const MESSAGES: Record<LicenseProblem, string> = {
  empty: 'Paste your license key first.',
  format: "That doesn't look like a whole license key. Copy all of it from your email and try again.",
  signature: "This key doesn't match. Copy it again from your email; one wrong letter breaks it.",
  product: 'This key is for a different product, not Ultimate Keyboards Pro.',
  expired: 'This key has run out.',
}

const fail = (problem: LicenseProblem, message = MESSAGES[problem]): LicenseCheck => ({ ok: false, problem, message })

// ── base64url ────────────────────────────────────────────────────────────────

export function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
    return Uint8Array.from(bin, c => c.charCodeAt(0))
  } catch {
    return null
  }
}

async function importPublicKey(raw: string): Promise<CryptoKey> {
  const bytes = fromBase64Url(raw)
  if (!bytes || bytes.length !== 32) throw new Error('license public key must be 32 bytes base64url')
  return crypto.subtle.importKey('raw', bytes, { name: 'Ed25519' }, false, ['verify'])
}

function isPayload(x: unknown): x is LicensePayload {
  const p = x as LicensePayload
  return !!p && typeof p === 'object' && p.v === 1
    && typeof p.product === 'string' && typeof p.email === 'string'
    && typeof p.id === 'string' && typeof p.issued === 'string'
    && (p.expires === undefined || (typeof p.expires === 'string' && !Number.isNaN(Date.parse(p.expires))))
}

// ── check ────────────────────────────────────────────────────────────────────

/** Checks a pasted key fully offline. Whitespace and line breaks from email are ignored. */
export async function checkLicense(
  input: string,
  opts: { publicKey?: string; now?: Date } = {},
): Promise<LicenseCheck> {
  const key = input.replace(/\s+/g, '')
  if (!key) return fail('empty')
  if (!key.startsWith(KEY_PREFIX)) return fail('format')
  const parts = key.slice(KEY_PREFIX.length).split('.')
  if (parts.length !== 2) return fail('format')
  const body = fromBase64Url(parts[0])
  const sig = fromBase64Url(parts[1])
  if (!body || !sig || sig.length !== 64) return fail('format')

  const publicKey = await importPublicKey(opts.publicKey ?? LICENSE_PUBLIC_KEY)
  const valid = await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, sig, body)
  if (!valid) return fail('signature')

  let payload: unknown
  try { payload = JSON.parse(new TextDecoder().decode(body)) } catch { return fail('format') }
  if (!isPayload(payload)) return fail('format')
  if (payload.product !== PRO_PRODUCT) return fail('product')
  if (payload.expires && Date.parse(payload.expires) <= (opts.now ?? new Date()).getTime()) {
    return fail('expired', `This key ran out on ${payload.expires.slice(0, 10)}.`)
  }
  return { ok: true, license: payload }
}

/** Signs a payload into a key. Used by the dev key script and tests; the app never holds a private key. */
export async function signLicense(payload: LicensePayload, privateKey: CryptoKey): Promise<string> {
  const body = new TextEncoder().encode(JSON.stringify(payload))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, body))
  return `${KEY_PREFIX}${toBase64Url(body)}.${toBase64Url(sig)}`
}
