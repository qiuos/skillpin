# Quality Guidelines

## TypeScript and modules

All runtime packages are ESM and extend the root strict compiler profile in `tsconfig.base.json`. Preserve strict typing, including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, and `verbatimModuleSyntax`.

Use explicit `.js` extensions for relative runtime imports in NodeNext code; see `packages/core/src/index.test.ts` importing `./index.js`.

## Validation commands

Run the relevant root commands before declaring a change complete:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm run test:e2e` when browser behavior changes, and `npm run pack && npm run verify-package` when CLI packaging changes. The CI workflow at `.github/workflows/ci.yml` runs both quality checks and Playwright browser E2E on Ubuntu, macOS, and Windows; see `p10-cross-platform-acceptance-contract.md`.

## Tests

- Use Vitest unit tests for core behavior, following `packages/core/src/index.test.ts`.
- Use Playwright for browser-visible behavior, following `tests/e2e/app.spec.ts`.
- Add platform-specific filesystem tests outside emitted package code and make cleanup reliable.
- For Node-only core persistence, use an injected `AtomicJsonFileSystem` or `onBeforeWriteStep` fault hook rather than weakening production error paths; tests must assert original-content preservation on failure.

## Avoid

- Do not weaken the root TypeScript settings to silence a local error.
- Do not bypass package boundaries with relative imports across workspaces.
- Do not commit generated `dist/`, `artifacts/`, coverage, or Playwright output; `.gitignore` excludes them.
