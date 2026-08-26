# Frontend Quality Guidelines

## Current Quality Gate

P0 requires `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` before shipping UI baseline changes.

## Browser Contract

- Playwright starts Vite at `http://127.0.0.1:4173` via `playwright.config.ts`.
- E2E tests live under `tests/e2e/` and assert accessible visible behavior.
- CI runs browser E2E on Ubuntu and static/unit/package quality checks on Linux, macOS, and Windows.

## Common Mistake

Do not use a package's private `src/` path to make development typechecking easier. Build core declarations first and consume its public package exports; this matches the package users will receive.
