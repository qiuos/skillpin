# Backend Directory Structure

## Scope / Trigger

P0 establishes a TypeScript npm workspace for the Node-side modules. There is no HTTP service, persistence module, or product feature yet.

## Current Layout

```text
packages/
├── core/
│   └── src/
│       ├── index.ts        # public domain primitives
│       └── *.test.ts       # colocated unit tests
└── cli/
    └── src/
        └── main.ts         # executable entry point
```

## Contracts

- `@skillpin/core` is the reusable domain package and must not import `@skillpin/cli` or `@skillpin/web`.
- `@skillpin/cli` may import public exports from `@skillpin/core` only; it must not import `@skillpin/web` or its source tree.
- Public core APIs are exported from `packages/core/src/index.ts` until a feature justifies a named module. Imports must use the package name, not another package's `src/` path.
- Node packages compile with `module` and `moduleResolution` set to `NodeNext`; relative ESM TypeScript imports use `.js` specifiers.

## Good / Base / Bad

```ts
// Good: stable package boundary.
import { ok } from "@skillpin/core";

// Bad: bypasses package exports and couples the CLI to another package layout.
import { ok } from "../../core/src/index.ts";
```

## Tests Required

- Add a colocated Vitest test when adding a pure core helper.
- Run `npm run lint`, `npm run typecheck`, and `npm test` after changing package boundaries.

## Common Mistake

`npm run build --workspaces` is not a dependency scheduler. Root scripts must explicitly build core before packages that consume its emitted declarations.
