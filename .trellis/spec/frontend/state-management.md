# State Management

## Current state

No client-state or server-state library is installed. `packages/web/src/main.tsx` contains a static root shell and a local constant derived through the shared core `ok` helper.

## Current decision

Use component-local React state for the first interactive behavior. Introduce shared state only when multiple independently rendered components must coordinate the same client state or when a local-service API contract requires caching, synchronization, or invalidation.

Keep these responsibilities separate:

- UI-only transient state belongs in the component or a focused custom hook.
- Reusable domain rules and filesystem/platform behavior belong in `@skillpin/core`.
- Future session/API state belongs behind typed web API clients rather than scattered fetch calls in components.

## Avoid

- Do not add Redux, Zustand, React Query, or another state dependency before its requirement is concrete.
- Do not store filesystem implementation details in React components.
- Do not duplicate the same domain state independently in CLI and Web.
