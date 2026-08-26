# Frontend Directory Structure

## Scope / Trigger

P0 establishes the Vite application shell in `@skillpin/web`; there are no feature pages, server calls, or shared component folders yet.

## Current Layout

```text
packages/web/
├── index.html
├── vite.config.ts
└── src/
    ├── main.tsx       # bootstrap and current shell component
    ├── styles.css     # application-wide baseline styles
    └── vite-env.d.ts  # Vite type declarations
```

## Contracts

- Browser code imports reusable domain primitives through `@skillpin/core`, never from `packages/core/src`.
- Browser code must not import `@skillpin/cli`.
- Keep a feature local to its own folder once it needs more than the application shell; extract common UI only after a real second consumer exists.

## Good / Base / Bad

```tsx
// Good: package boundary.
import { ok } from "@skillpin/core";

// Bad: couples the UI to an internal source path.
import { ok } from "../../core/src/index.ts";
```

## Tests Required

- Add browser assertions in `tests/e2e/` for user-visible shell or workflow changes.
- Run `npm run build` after Vite configuration or entry-point changes.
