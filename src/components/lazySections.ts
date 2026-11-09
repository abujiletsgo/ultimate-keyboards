/**
 * Section code, split per section and preloaded once the first screen is up
 * (App), so a first visit to any section draws in its first frame instead of
 * a Suspense skeleton (lib/preloadable).
 */
import { preloadable } from '@/lib/preloadable'

export const KeyboardSection = preloadable(() => import('@/components/Keyboard/KeyboardSection'))
export const KarabinerEditor = preloadable(() => import('@/components/KarabinerEditor'))
export const Mouse = preloadable(() => import('@/components/Mouse'))
export const Settings = preloadable(() => import('@/components/Settings'))
export const Onboarding = preloadable(() => import('@/components/Onboarding'))
export const Pointing = preloadable(() => import('@/components/Pointing'))

export function preloadSections(): void {
  for (const s of [KeyboardSection, KarabinerEditor, Mouse, Settings, Onboarding, Pointing]) {
    s.preload().catch(() => { /* the section's own Suspense retries on visit */ })
  }
}
