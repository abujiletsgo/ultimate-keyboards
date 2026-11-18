/**
 * Where Pro is bought. No seller is chosen yet (Tom, 2026-11-17), so the app
 * makes no network call and shows no checkout.
 *
 * TODO(KE-60 vendor): pick Paddle or Lemon Squeezy, then implement this for it:
 * - checkoutUrl: the hosted checkout page for Ultimate Keyboards Pro.
 * - the seller's webhook (server side, not in this app) signs a UK1 key with
 *   scripts/license-key.ts's format and emails it; the app keeps checking keys
 *   offline with checkLicense, so no seller API call is needed here.
 */
export interface LicenseVendor {
  name: 'Paddle' | 'Lemon Squeezy' | 'none'
  /** null while buying is not open */
  checkoutUrl: string | null
}

export const VENDOR: LicenseVendor = { name: 'none', checkoutUrl: null }
