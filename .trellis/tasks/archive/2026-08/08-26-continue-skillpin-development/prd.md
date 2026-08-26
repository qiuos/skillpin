# SkillPin P10：跨模块集成、质量与三平台验收

## Goal

依据《SkillPin实施计划》完成 P10：将 P0–P9 的功能闭环映射到正式方案的 AC-01 至 AC-20，并以自动化或有记录的人工验收覆盖 macOS、Linux、Windows 的核心场景；修复验证中发现的产品缺陷，并同步受影响的持久化规则和实现契约。

## Authoritative Requirements

- Source plan: `/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin实施计划.md`，P10 “跨模块集成、质量与三平台验收”。
- Acceptance specification: `/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin产品技术一体化方案.md` §14.1, AC-01–AC-20.
- P10 follows completed P9 and precedes P11 (build, installation, upgrade, and delivery); it must validate the complete product rather than substitute packaging validation for feature acceptance.

## Requirements

1. Map every AC-01 through AC-20 to an automated test or a reproducible, recorded manual acceptance procedure. Preserve the matrix and evidence in the repository task materials or durable test documentation.
2. Establish post-install end-to-end validation on macOS, Linux, and Windows for the core user flow. Platform-specific link behavior must include native Windows verification for Junction/symlink fallback when CI cannot faithfully reproduce host permissions.
3. Expand fixtures and integration/E2E coverage for paths containing spaces and Chinese characters, case-sensitive/case-insensitive names, Windows drive and cross-volume conditions where applicable, unreadable sources, stale/invalid links, and unknown-content protection.
4. Verify browser/session lifecycle: refresh, close/reconnect, multiple tabs, explicit exit with staged changes, and the 60-second last-client shutdown/reuse contract.
5. Verify local API/browser security: hostile Origin and Host handling, unauthenticated requests, path traversal, and untrusted Markdown must not mutate the project or execute untrusted content.
6. Verify transactional resilience: apply interruption/fault injection, rollback, incomplete rollback recovery, stale revision, duplicate submission/idempotency, and cleanup of temporary artifacts.
7. Verify accessibility and UX: keyboard-only workflows, focus behavior, theme modes, non-color state indicators, responsive information architecture, primary actions, and recovery actions.
8. Verify that terminal/debug logging never reveals session secrets or full skill body content.
9. Verify user configuration and project manifest migration, corruption handling, backup behavior, and rejection of unsupported future schema versions without destructive overwrite.
10. Fix verified defects found during P10 and update the affected Trellis specs or product-design facts when a durable contract changes.

## Acceptance Criteria

- [ ] AC-01: first-run session opens onboarding with the correct target project.
- [ ] AC-02: adding a readable source scans and displays valid/warning results without modifying the source.
- [ ] AC-03: multi-source text and source-filter search gives consistent result/count/filter state.
- [ ] AC-04: duplicate candidates permit one selected candidate; switching an enabled candidate plans a replacement.
- [ ] AC-05: applying to a project without `.agents` creates links and manifest consistently.
- [ ] AC-06: removing a managed skill only removes the verified targeted link and preserves unknown content.
- [ ] AC-07: replacing a managed candidate safely updates the link and increments manifest revision.
- [ ] AC-08: existing real directories or unknown links block an overwrite and provide recovery guidance.
- [ ] AC-09: stale project state is rejected and returns the UI to a fresh review.
- [ ] AC-10: injected transaction failure rolls back, or returns `ROLLBACK_INCOMPLETE` with apply blocked and manual recovery.
- [ ] AC-11: Windows falls back to Junction when directory symlinks are unavailable and records the actual link type.
- [ ] AC-12: closing the last page begins the 60-second waiting-to-exit lifecycle.
- [ ] AC-13: reconnecting/reinvoking within the grace period reuses the session and cancels shutdown.
- [ ] AC-14: explicit exit with staged changes asks for confirmation and never applies unconfirmed disk changes.
- [ ] AC-15: concurrent sessions for different projects keep ports, manifests, links, and state isolated.
- [ ] AC-16: missing configured source leaves verified project links removable but visibly unconfigured.
- [ ] AC-17: hostile Origin/Host or missing session credentials cannot access a local write API.
- [ ] AC-18: untrusted Markdown cannot execute scripts, event attributes, or iframe content.
- [ ] AC-19: corrupt configuration/manifest remains untouched and produces an actionable read-only recovery error.
- [ ] AC-20: `Ctrl+C` exits idle work immediately and safely settles or rolls back an active apply.
- [ ] The three-platform core flow has passing evidence; unresolved platform limitations are explicitly documented with native-host reproduction steps.
- [ ] No unresolved high-severity defects remain in unknown-content protection, transaction consistency, or local API security.
- [ ] Quality gates pass: format, lint, typecheck, build, unit/integration tests, and E2E tests.

## Definition of Done

- Tests and fixtures are added/updated at the correct layer; automated coverage is favored where deterministic.
- macOS, Linux, and Windows evidence is captured through CI and/or documented native-host procedures.
- All discovery-led code fixes are accompanied by regression tests.
- Trellis frontend/backend specifications record any durable conventions discovered during full-flow validation.
- P11 packaging/distribution work is not implemented in P10 beyond tests needed to exercise the current development product.

## Technical Approach

1. Inventory existing unit, integration, platform, and Playwright coverage against the AC-01–AC-20 matrix; add missing tests using existing session/test fixtures and avoid replacing real filesystem transactions with mocks for cross-layer flows.
2. Add or refine platform-aware fixtures and CI matrix support. Mark truly host-specific cases as required native/manual verification with deterministic steps rather than asserting unsupported behavior on the current host.
3. Drive the React client through representative P7–P9 workflows in Playwright, and use CLI/server integration tests for security, lifecycle, and transactional invariants.
4. Run the full quality gate repeatedly; investigate and fix root causes, preserving browser-safe core/CLI/Web boundaries.
5. Record acceptance evidence and update specs only where implementation establishes a reusable contract.

## Scope

- `tests/e2e/`, `tests/integration/`, `tests/platform/`, and `tests/fixtures/`
- Package-level unit and integration tests needed to close AC gaps
- `playwright.config.ts`, GitHub Actions/CI configuration, and test-support scripts
- Narrow production-code defect fixes verified by P10
- Trellis specs and P10 research/evidence material
- The original product/design documents only if validation proves an existing stated design fact is incorrect

## Out of Scope

- P11 single-package construction, Web-asset embedding in the distributable CLI, npm/Git/private-registry install and upgrade validation, license inventory, release artifact creation, or public publishing.
- New product capabilities outside AC-01–AC-20, including multi-project management, remote synchronization, native desktop shells, or a headless batch CLI.
- Rewriting P1–P9 subsystems without a reproduced P10 defect and a regression test.

## Decision (ADR-lite)

**Context:** P0–P9 are implemented and individually checked, but the authoritative roadmap requires a complete-product acceptance phase before distribution work.

**Decision:** Execute P10 before P11. Treat the authoritative AC-01–AC-20 matrix as the quality contract; use automated coverage where reliable, retain explicit native-platform procedures where host capabilities cannot be emulated, and only make production changes to resolve reproduced integration defects.

**Consequences:** The task spans core, CLI, Web, tests, and CI, but remains validation-led. P11 cannot be considered completed until P10 evidence closes the complete product loop.

## Technical Notes

- Current head commit before P10: `c587d6d` (`chore: record journal`), following archived P9 commits.
- P9 PRD: `.trellis/tasks/archive/2026-08/08-26-skillpin-p9-project-change-workflow/prd.md`.
- Existing commands: `npm run build`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run lint`, `npm run format:check`, `npm run pack`, and `npm run verify-package`.
- Existing architecture specs: `.trellis/spec/backend/` and `.trellis/spec/frontend/`.
