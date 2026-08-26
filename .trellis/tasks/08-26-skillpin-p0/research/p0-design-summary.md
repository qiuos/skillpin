# SkillPin P0 Design Summary

## Sources

- `SkillPin产品技术一体化方案.md`, sections 8.1–8.5
- `SkillPin实施计划.md`, P0 “仓库与质量基线”

## Decisions fixed by the plan

1. Use a single-process Node.js modular monolith, split only into `core`, `cli`, and `web` packages at this stage.
2. Use TypeScript across runtime and UI. The UI uses React and Vite.
3. Establish unit, browser E2E, and three-platform CI entry points now; feature-specific tests come later.
4. The dependency direction is one-way: reusable `core` has no `cli`/`web` dependency. The CLI must not import Web source code; Web can use core.
5. Product features, filesystem adapters, links, transactions, and HTTP/WebSocket service are explicitly excluded from P0.
6. Dependency versions are intentionally selected and locked in the implementation repository rather than specified in the product document.

## P0 verification targets

- All workspaces build and typecheck from the repository root.
- CLI prints a temporary version banner.
- Web renders an empty application shell.
- Core can be imported by both CLI and Web.
- A package archive and archive verification command exist as a baseline, without claiming the P11 final distributable package is complete.
