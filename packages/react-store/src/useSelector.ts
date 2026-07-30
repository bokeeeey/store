import { useCallback } from 'react'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector'

export interface UseSelectorOptions<TSelected, TSource = unknown> {
  compare?: (a: TSelected, b: TSelected) => boolean
  /**
   * Returns the snapshot used during server rendering and during hydration of
   * server-rendered content — it should return the value the server render
   * used, even if the store has changed since. Because React also calls it on
   * the server, it must return the state the server actually rendered. Keep
   * the reference stable across renders (like `selector`). Defaults to
   * reading the live value, which preserves the existing behavior.
   *
   * Only takes effect on React 18+; on React 16/17 the
   * `use-sync-external-store` shim ignores it.
   *
   * @see https://react.dev/reference/react/useSyncExternalStore
   */
  getServerSnapshot?: () => TSource
}

type SyncExternalStoreSubscribe = Parameters<
  typeof useSyncExternalStoreWithSelector
>[0]

type SelectionSource<T> = {
  get: () => T
  subscribe: (listener: (value: T) => void) => {
    unsubscribe: () => void
  }
}

function defaultCompare<T>(a: T, b: T) {
  return a === b
}

/**
 * Selects a slice of state from an atom or store and subscribes the component
 * to that selection.
 *
 * This is the primary React read hook for TanStack Store. It works with any
 * source that exposes `get()` and `subscribe()`, including atoms, readonly
 * atoms, stores, and readonly stores.
 *
 * Omit the selector to subscribe to the whole value.
 *
 * @example
 * ```tsx
 * const count = useSelector(counterStore, (state) => state.count)
 * ```
 *
 * @example
 * ```tsx
 * const value = useSelector(countAtom)
 * ```
 *
 * @example
 * ```tsx
 * // SSR: return the state the server rendered (e.g. serialized into the
 * // HTML), so a late-hydrating Suspense boundary still matches the server
 * // HTML even if an earlier-hydrated effect has already updated the store
 * const itemCount = useSelector(cartStore, (s) => s.items.length, {
 *   getServerSnapshot: getServerCartState,
 * })
 * ```
 */
export function useSelector<TSource, TSelected = NoInfer<TSource>>(
  source: SelectionSource<TSource>,
  selector: (snapshot: TSource) => TSelected = (s) => s as unknown as TSelected,
  options?: UseSelectorOptions<TSelected, NoInfer<TSource>>,
): TSelected {
  const compare = options?.compare ?? defaultCompare

  const subscribe: SyncExternalStoreSubscribe = useCallback(
    (handleStoreChange) => {
      const { unsubscribe } = source.subscribe(handleStoreChange)
      return unsubscribe
    },
    [source],
  )

  const getSnapshot = useCallback(() => source.get(), [source])

  // React throws during hydration when getServerSnapshot is undefined, so
  // always fall back to the live snapshot (the previous behavior).
  const getServerSnapshot = options?.getServerSnapshot ?? getSnapshot

  return useSyncExternalStoreWithSelector(
    subscribe,
    getSnapshot,
    getServerSnapshot,
    selector,
    compare,
  )
}
