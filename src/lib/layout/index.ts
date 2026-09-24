export * from './types'
export { parseZmkPhysicalLayouts, toZmkPhysicalLayoutDtsi } from './zmkDtsi'
export { parseInfoJsonLayouts, toInfoJsonLayouts } from './infoJson'
export { parseMatrixTransforms, gridLayoutFromTransform } from './matrixGrid'
export { parseKle, toKle } from './kle'

import type { PhysicalLayout } from './types'
import { CROSSES_LAYOUT } from '../crossesLayout'
import { CORNE_PROCYON_LAYOUT } from '../corneProcyonLayout'

/**
 * The two hand-written layouts from before the registry, expressed in the
 * canonical model so the renderer has one code path. Kept only as seeds for
 * migrating an existing install; new keyboards always import or pick one.
 */
export const LEGACY_CROSSES: PhysicalLayout = {
  name: 'Crosses / Corne 42',
  source: 'legacy',
  origin: 'crossesLayout.ts',
  keys: CROSSES_LAYOUT.map(k => ({ x: k.x, y: k.y, ...(k.w && k.w !== 1 ? { w: k.w } : {}), ...(k.h && k.h !== 1 ? { h: k.h } : {}), hand: k.x < 6.5 ? 'L' as const : 'R' as const })),
}

export const LEGACY_CORNE_PROCYON: PhysicalLayout = {
  name: 'Corne Procyon 44',
  source: 'legacy',
  origin: 'corneProcyonLayout.ts',
  keys: CORNE_PROCYON_LAYOUT.map(k => ({ x: k.x, y: k.y, ...(k.w && k.w !== 1 ? { w: k.w } : {}), ...(k.h && k.h !== 1 ? { h: k.h } : {}), ...(k.isEncoder ? { encoder: true } : {}), hand: k.x < 6.4 ? 'L' as const : 'R' as const })),
}
