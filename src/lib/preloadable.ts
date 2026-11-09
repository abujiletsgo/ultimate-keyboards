import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * React.lazy that draws in the first frame once its code is loaded.
 *
 * Plain lazy() calls its factory on first render and suspends until the
 * returned promise settles, and a native promise always settles a microtask
 * later. So even with the chunk already in memory, the first visit to a
 * section showed its Suspense skeleton for a frame. Here, once `preload()` has
 * finished, the factory hands React a thenable that resolves synchronously,
 * and lazy() renders the component straight away.
 */
export function preloadable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): {
  Component: LazyExoticComponent<ComponentType<P>>
  preload: () => Promise<unknown>
} {
  let loaded: { default: ComponentType<P> } | undefined
  let pending: Promise<{ default: ComponentType<P> }> | undefined
  const preload = () => (pending ??= load().then(m => (loaded = m), e => { pending = undefined; throw e }))
  const Component = lazy(() => (loaded
    ? ({ then: (resolve: (m: { default: ComponentType<P> }) => void) => resolve(loaded!) } as unknown as Promise<{ default: ComponentType<P> }>)
    : preload()))
  return { Component, preload }
}
