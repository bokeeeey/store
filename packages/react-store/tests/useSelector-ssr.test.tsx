import { Suspense, lazy } from 'react'
import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, test } from 'vitest'
import { createStore, useSelector } from '../src/index'
import type { ComponentType } from 'react'
import type { Root } from 'react-dom/client'

const actGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actGlobal.IS_REACT_ACT_ENVIRONMENT = true

/** Runs work inside async `act` so pending microtasks (lazy resolution, store
 * notifications) are flushed before returning. */
function actFlush(work: () => void) {
  return act(() => {
    work()
    return Promise.resolve()
  })
}

function App({ Label }: { Label: ComponentType }) {
  return (
    <div>
      <p>shell</p>
      <Suspense fallback={<p>loading</p>}>
        <Label />
      </Suspense>
    </div>
  )
}

/** A lazy component whose module resolution the test controls. */
function deferredLazy(Component: ComponentType) {
  let resolveInner: (() => void) | undefined
  const Lazy = lazy(
    () =>
      new Promise<{ default: ComponentType }>((resolve) => {
        resolveInner = () => resolve({ default: Component })
      }),
  )
  return {
    Lazy,
    resolve: () => {
      if (!resolveInner) throw new Error('lazy factory was never invoked')
      resolveInner()
    },
  }
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

/**
 * Server-renders the app, hydrates the shell with the label behind an
 * unresolved lazy(), mutates the store (as a post-hydration effect would),
 * then resolves the lazy chunk so the Suspense boundary hydrates late.
 */
async function hydrateWithLateBoundary(
  Label: ComponentType,
  mutateStore: () => void,
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  container.innerHTML = renderToString(<App Label={Label} />)

  const { Lazy, resolve } = deferredLazy(Label)
  const recoverableErrors: Array<unknown> = []
  let root!: Root
  await actFlush(() => {
    root = hydrateRoot(container, <App Label={Lazy} />, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    })
  })
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  expect(recoverableErrors).toHaveLength(0)

  await actFlush(mutateStore)
  await actFlush(resolve)

  return { container, recoverableErrors }
}

describe('useSelector SSR', () => {
  test('server render defaults to the live snapshot (existing behavior)', () => {
    const cart = createStore({ items: ['apple'] })
    cart.setState((prev) => ({ items: [...prev.items, 'banana'] }))

    function Label() {
      const count = useSelector(cart, (state) => state.items.length)
      return <p>{`Cart (${count})`}</p>
    }

    expect(renderToString(<App Label={Label} />)).toContain('Cart (2)')
  })

  test('server render uses getServerSnapshot when provided', () => {
    const cart = createStore({ items: ['apple'] })
    const serverCart = { items: ['apple'] }
    cart.setState((prev) => ({ items: [...prev.items, 'banana'] }))

    function Label() {
      const count = useSelector(cart, (state) => state.items.length, {
        getServerSnapshot: () => serverCart,
      })
      return <p>{`Cart (${count})`}</p>
    }

    expect(renderToString(<App Label={Label} />)).toContain('Cart (1)')
  })

  test('getServerSnapshot keeps a late-hydrating boundary consistent with the server HTML', async () => {
    const cart = createStore({ items: ['apple'] })
    const serverCart = { items: ['apple'] }

    function Label() {
      const count = useSelector(cart, (state) => state.items.length, {
        getServerSnapshot: () => serverCart,
      })
      return <p>{`Cart (${count})`}</p>
    }

    const { container, recoverableErrors } = await hydrateWithLateBoundary(
      Label,
      () => cart.setState((prev) => ({ items: [...prev.items, 'banana'] })),
    )

    expect(recoverableErrors).toHaveLength(0)
    expect(container.textContent).toContain('Cart (2)')
  })

  test('without getServerSnapshot the same scenario reads the live value and mismatches (default unchanged)', async () => {
    const cart = createStore({ items: ['apple'] })

    function Label() {
      const count = useSelector(cart, (state) => state.items.length)
      return <p>{`Cart (${count})`}</p>
    }

    const { container, recoverableErrors } = await hydrateWithLateBoundary(
      Label,
      () => cart.setState((prev) => ({ items: [...prev.items, 'banana'] })),
    )

    expect(recoverableErrors.length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Cart (2)')
  })
})
