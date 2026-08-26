# Backend Quality Guidelines

## Scope / Trigger

P0 establishes the workspace, package boundary, and quality-command contract used by all later Node-side implementation.

## Signatures

| Command | Contract |
| --- | --- |
| `npm run lint` | ESLint checks source and configuration; package cycles are errors. |
| `npm run typecheck` | Builds core declarations, then checks CLI and Web with strict TypeScript. |
| `npm test` | Runs Vitest unit tests declared in `vitest.workspace.ts`. |
| `npm run build` | Builds `core` → `cli` → `web` in that order. |
| `npm run pack` | Builds and creates exactly one CLI archive under `artifacts/`. |
| `npm run verify-package` | Requires exactly one archive and checks `package.json`, `dist/main.js`, and `dist/main.d.ts`. |

## Contracts

- TypeScript stays strict, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax` enabled.
- Package-boundary violations and circular imports are lint errors; do not suppress them with inline disable comments.
- Build output, test reports, archives, and dependencies are ignored by Git.

## Validation & Error Matrix

| Condition | Expected result |
| --- | --- |
| Core declarations absent | Root typecheck/build first compiles core. |
| Archive missing | `verify-package` fails with an actionable instruction to run `npm run pack`. |
| Archive has missing executable/type declarations | `verify-package` fails and lists missing entries. |
| More than one archive exists | Packaging/verification fails rather than selecting an arbitrary archive. |

## Good / Base / Bad

```sh
# Good: run the root quality gate.
npm run format:check && npm run lint && npm run typecheck && npm test

# Bad: typecheck only the CLI from a clean checkout; core declarations may not exist.
npm run typecheck --workspace=@skillpin/cli
```

## Tests Required

- Pure core code gets Vitest unit coverage.
- Visible browser behavior gets Playwright coverage in `tests/e2e/`.
- Any package archive contract change updates `scripts/verify-package.mjs` tests or validation evidence.
