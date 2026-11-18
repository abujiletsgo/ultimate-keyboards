/**
 * Which features Pro unlocks. Source: marketing/facts.md, Price table
 * (Tom, 2026-11-15). Free features are never gated: `canUse` returns true
 * for them before it looks at the license, so no key state can lock one.
 */
import type { LicensePayload } from './license'

/** Price shown in the app; quoted from marketing/facts.md, change it there first. */
export const PRO_PRICE = '$24, paid once'

export const FREE_FEATURES = {
  'home-row-mods': 'Home-row mods with misfire protection',
  layers: 'Layers',
  combos: 'Combos',
  'hyper-caps': 'Hyper on Caps Lock',
  'layer-overlay': 'Layer overlay',
  'health-panel': 'Health panel',
  'zmk-qmk-editing': 'ZMK and QMK editing',
  'firmware-flashing': 'Firmware building and flashing',
} as const

export const PRO_FEATURES = {
  'phone-typing': 'Type on your iPhone or iPad with your MacBook keyboard',
  'per-app-layers': 'Different layers for each app',
  'one-layout': 'One layout for your MacBook and your ZMK or QMK board',
  sync: 'iCloud sync and presets',
} as const

export type FreeFeature = keyof typeof FREE_FEATURES
export type ProFeature = keyof typeof PRO_FEATURES
export type Feature = FreeFeature | ProFeature

export const isProFeature = (f: Feature): f is ProFeature => Object.hasOwn(PRO_FEATURES, f)

/** The one gate. Pass the license only after `checkLicense` said ok. */
export function canUse(feature: Feature, license: LicensePayload | null): boolean {
  if (!isProFeature(feature)) return true
  return license !== null
}
