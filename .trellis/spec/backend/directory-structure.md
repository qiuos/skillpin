# Directory Structure

## Current layout

The runtime/shared package is `packages/core`. It is an ESM TypeScript package that compiles `src/` to `dist/` and exposes only its package root.

- Put reusable domain primitives and platform-independent behavior under `packages/core/src/`.
- Keep browser-safe shared primitives in `packages/core/src/shared/` and re-export their public root API from `packages/core/src/index.ts`. Export Node-only platform, transaction, and persistence contracts from stable subpaths: `packages/core/src/platform/index.ts`, `packages/core/src/changes/index.ts`, `packages/core/src/persistence/index.ts`, and `packages/core/src/catalog/index.ts`.
- Put browser-safe P2 domain objects under `packages/core/src/domain/`; keep runtime schemas/repositories in `config/`, `project/`, and `shared/`, behind the persistence subpath.
- Place tests next to the code they exercise using `*.test.ts`; the existing example is `packages/core/src/index.test.ts`.
- Put executable entry points in `packages/cli/src/`; the current CLI entry point is `packages/cli/src/main.ts`.
- Put repository-level build and archive verification utilities in `scripts/`, using ESM `.mjs` files such as `scripts/build-package.mjs`.
- Put cross-package browser tests under `tests/e2e/`; keep future filesystem/platform integration tests under `tests/platform/` or `tests/integration/`, not in a package's emitted `dist/` tree.

## Package boundaries

`@skillpin/core` is the reusable bottom layer. It must not import `@skillpin/cli` or `@skillpin/web`. `@skillpin/cli` can use core but must not import Web source; `@skillpin/web` can use core but must not import CLI. These constraints are enforced in `eslint.config.js`.

## Examples

- `packages/core/src/index.ts` exports the browser-safe `Result` primitives used by both outer packages.
- `packages/core/src/platform/index.ts`, `packages/core/src/changes/index.ts`, `packages/core/src/persistence/index.ts`, and `packages/core/src/catalog/index.ts` expose Node-only P1/P2/P3 APIs without pulling `node:fs` or `node:crypto` into the Web bundle.
- `packages/core/src/shared/result.ts` holds the root `Result` primitives so domain errors can depend on them without creating a root-export circular dependency.
- `packages/cli/src/main.ts` imports `ok` from `@skillpin/core` rather than recreating the result shape.
- `scripts/verify-package.mjs` is a repository utility rather than CLI runtime code.

## Avoid

- Do not put CLI command parsing or React code in `packages/core`.
- Do not import another package's `src/` files; consume its declared package export instead.
- Do not export Node-only modules from `@skillpin/core` package root, because Web imports that root. Use the `@skillpin/core/platform`, `@skillpin/core/changes`, `@skillpin/core/persistence`, or `@skillpin/core/catalog` subpath instead.
- Do not create empty directories merely to mirror the long-term roadmap; add a directory with its first concrete responsibility.
