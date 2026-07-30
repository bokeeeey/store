---
'@tanstack/react-store': minor
---

Add an opt-in `getServerSnapshot` option to `useSelector` (inherited by `useAtom` and `_useStore`) so SSR apps can provide the value the server render actually used. Previously the live client snapshot was passed as the server snapshot, so a store write landing before a (late-hydrating) boundary hydrates produced a React hydration mismatch. Defaults to the live snapshot — existing behavior is unchanged.
