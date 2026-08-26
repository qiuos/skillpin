# Component Guidelines

## Current pattern

The P0 UI keeps the root component local to `packages/web/src/main.tsx` because it is a single application shell. `App` is a function component rendered through `createRoot` inside `StrictMode`.

```tsx
function App() {
  return (
    <main className="app-shell">
      <section aria-labelledby="app-title">...</section>
    </main>
  );
}
```

## Rules

- Use function components and direct TypeScript inference for simple local components.
- Extract a component when it owns a coherent UI responsibility, is reused, or makes its parent difficult to read; keep the initial single-shell case local.
- Prefer semantic elements and accessible names. The current shell uses `main`, a real `h1`, and `aria-labelledby`; Playwright queries the visible heading by role.
- Import package dependencies before local styles, with a blank line separating them, matching `packages/web/src/main.tsx`.

## Avoid

- Do not use a generic clickable `div` when a native button, link, input, or semantic section applies.
- Do not rely only on CSS class selectors for important behavior tests; use accessible roles/names where possible.
- Do not introduce a component library or global UI abstraction before it has more than one real consumer.
