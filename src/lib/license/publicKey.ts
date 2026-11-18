/**
 * Ed25519 public key (raw, base64url) that checks Pro license keys.
 * Its private half is a dev key on the homelab Mac at
 * ~/.config/ultimate-keyboards/license-signing-key (made 2026-11-17 by
 * `bun scripts/license-key.ts init`), never in git. Replace both together
 * when the seller is chosen; keys made with the old one then stop working.
 */
export const LICENSE_PUBLIC_KEY = 'EXhO1zxPbGA4xc1HVOEmndWa0LWzLV0ZOYkaM-soS3g'
