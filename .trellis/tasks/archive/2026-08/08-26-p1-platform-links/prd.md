# P1: Cross-platform link and transaction validation

## Goal

Deliver the smallest production-quality core prototype that proves SkillPin can safely create, identify, replace, remove, and roll back managed directory links across macOS, Linux, and Windows. The resulting public platform contract must be suitable for P2–P5 and must never silently fall back to copying a directory.

## What I already know

- P0 established a Node.js 22+ TypeScript npm workspace with `@skillpin/core`, strict TypeScript, Vitest, and Ubuntu/macOS/Windows CI.
- The confirmed implementation plan defines P1 as the risk gate before full UI work: validate directory symbolic links on macOS/Linux and directory Junction fallback on Windows.
- The product design requires normalized real target paths, recorded link type, no copy-directory fallback, and stage-by-stage transactional rollback.
- Node's `fsPromises.symlink` supports Windows `junction` link type; Junction targets must be absolute and apply only to directories.
- Current core APIs use `SkillPinError` and `Result`; test files are colocated for unit behavior, with platform/integration tests under `tests/`.

## Requirements

- [x] Define and export a `PlatformLinkAdapter` interface and typed link inspection/capability/error results from `@skillpin/core`.
- [x] Implement Node-backed directory-link operations: create, inspect, rename, and safely remove only a verified managed link.
- [x] On macOS/Linux, create directory symbolic links and classify dangling links without following them.
- [x] On Windows, attempt a directory symbolic link and fall back to a directory Junction only for an eligible symlink-creation failure; never fall back to copying.
- [x] Normalize existing directory targets to canonical real paths and generate a stable cryptographic fingerprint from the normalized target path.
- [x] Preserve link identity across spaces and non-ASCII path segments; verify platform-specific case/path behavior through automated tests.
- [x] Prototype transactional add, remove, and replace operations using unique sibling temporary and backup names; inject failures at every mutation boundary and reverse completed mutations on failure.
- [x] Write a manifest atomically in the same directory as its final path and include recovery diagnostics for unrecoverable rollback failures.
- [x] Refuse to remove or overwrite ordinary directories, files, unknown links, and mismatched managed links.
- [x] Add Linux/macOS/Windows-compatible automated tests, with Windows-specific Junction fallback coverage conditional on Windows execution.

## Acceptance Criteria

- [x] `npm run typecheck`, `npm test`, `npm run lint`, and `npm run format:check` pass.
- [x] Platform tests validate creation, inspection, rename, safe removal, and dangling-link classification on the host OS.
- [x] Windows CI validates Junction fallback when symlink creation is denied or simulated as denied, and does not copy a target directory.
- [x] Paths containing spaces and Chinese characters preserve the expected canonical target and fingerprint behavior.
- [x] File transaction tests prove add, remove, and replace restore the original filesystem state for every injected mutation failure that can be rolled back.
- [x] Any rollback failure has a stable error code and machine-readable manual recovery details.
- [x] CI quality workflow runs the platform/unit test set on Ubuntu, macOS, and Windows.

## Definition of Done

- Tests cover the new public contract and dangerous filesystem boundaries.
- Lint, typecheck, test, formatting, and build checks pass locally.
- The implementation follows the core/package boundaries and the platform contract is documented for future tasks.

## Out of Scope

- Skill source scanning, user configuration, project manifests, and production project-state classification.
- A complete P4 transaction engine, process locks, revision handling, or startup recovery workflow.
- CLI command parsing, local HTTP/WebSocket service, browser UI, or final npm distributable behavior.
- Directory-copy fallback, remote filesystems, and permanent product schema design.

## Technical Notes

- Primary source: `/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin实施计划.md`, P1.
- Supporting design: `/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin产品技术一体化方案.md`, sections 8.4, 8.5, and 13.2.
- Existing baseline: `packages/core/src/index.ts`, `packages/core/src/index.test.ts`, `eslint.config.js`, `.github/workflows/ci.yml`.
- Research is recorded in `research/node-fs-platform-contract.md`.
