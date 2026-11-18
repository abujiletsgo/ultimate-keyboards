#!/usr/bin/env bun
/**
 * Dev-only Ultimate Keyboards Pro key maker. Never shipped in the app.
 *
 *   bun scripts/license-key.ts init                 make a signing key (once) and print its public key
 *   bun scripts/license-key.ts issue --email a@b.c [--id ORDER] [--expires 2027-01-01] [--product uk-pro]
 *
 * The private key is read from $UK_LICENSE_PRIVATE_KEY (base64url PKCS#8) or the
 * file at $UK_LICENSE_KEY_FILE, default ~/.config/ultimate-keyboards/license-signing-key.
 * It must never be inside the repo; this script refuses a path in the repo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fromBase64Url, signLicense, toBase64Url, PRO_PRODUCT, type LicensePayload } from '../src/lib/license/license'
import { LICENSE_PUBLIC_KEY } from '../src/lib/license/publicKey'

const repo = resolve(import.meta.dir, '..')
const keyFile = resolve(process.env.UK_LICENSE_KEY_FILE ?? join(homedir(), '.config/ultimate-keyboards/license-signing-key'))

function die(msg: string): never { console.error(msg); process.exit(1) }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function loadPrivate(): Promise<CryptoKey> {
  const text = process.env.UK_LICENSE_PRIVATE_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')
  const bytes = fromBase64Url(text.trim())
  if (!bytes?.length) die(`No signing key. Set UK_LICENSE_PRIVATE_KEY or run: bun scripts/license-key.ts init`)
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'Ed25519' }, true, ['sign'])
}

async function publicOf(priv: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', priv)
  return jwk.x!
}

const cmd = process.argv[2]
if (keyFile.startsWith(repo + '/')) die(`Refusing a signing key inside the repo: ${keyFile}`)

if (cmd === 'init') {
  if (existsSync(keyFile)) die(`${keyFile} already exists; not replacing it (old keys would stop working).`)
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair
  mkdirSync(dirname(keyFile), { recursive: true, mode: 0o700 })
  writeFileSync(keyFile, toBase64Url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))) + '\n', { mode: 0o600 })
  const pub = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  console.log(`Private key: ${keyFile}\nPut this in src/lib/license/publicKey.ts:\n${pub}`)
} else if (cmd === 'issue') {
  const email = arg('email') ?? die('--email is required')
  const expires = arg('expires')
  if (expires && Number.isNaN(Date.parse(expires))) die(`--expires is not a date: ${expires}`)
  const priv = await loadPrivate()
  if ((await publicOf(priv)) !== LICENSE_PUBLIC_KEY) console.error('Warning: this signing key does not match the public key in the app; the app will reject the key.')
  const payload: LicensePayload = {
    v: 1,
    product: arg('product') ?? PRO_PRODUCT,
    email,
    id: arg('id') ?? `dev-${Date.now()}`,
    issued: new Date().toISOString().slice(0, 10),
    ...(expires ? { expires: new Date(expires).toISOString() } : {}),
  }
  console.log(await signLicense(payload, priv))
} else {
  die('Usage: bun scripts/license-key.ts init | issue --email a@b.c [--id ORDER] [--expires DATE] [--product uk-pro]')
}
