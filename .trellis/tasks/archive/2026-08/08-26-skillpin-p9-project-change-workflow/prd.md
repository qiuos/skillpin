# SkillPin P9 project change workflow

## Goal

Build the next roadmap phase after P8: let a user stage catalog candidates against the active project, obtain a deterministic project-change plan, and safely apply it through the existing P4 transaction engine with clear success, conflict, and recovery states.

## What I already know

- P8 is complete and provides a read-only, session-local catalog workbench at `/skills`, candidate comparison, safe Markdown detail rendering, and no project mutations.
- P4 already implements project inspection, deterministic add/remove/replace planning, lock/idempotency/revision validation, transactional apply/rollback, and recovery diagnostics in `@skillpin/core`.
- P5 provides authenticated loopback HTTP route registration and `ManagedSession.runProjectOperation()` for P6–P9 work around project applies.
- The P8 PRD explicitly defers project-change selection, plan/apply endpoints, transaction execution, conflict resolution, recovery, and a bottom change bar to P9.
- The repository is clean, P8 is archived, and the next natural roadmap phase appears to be P9.

## Assumptions (temporary)

- P9 should expose existing P4 behavior through protected, browser-safe API contracts rather than reimplementing project mutation logic in the CLI or browser.
- P9 should preserve the catalog’s all-candidate comparison behavior while adding an explicit staged selection model; users must understand staging alone does not mutate the project.
- P9 covers inspection, planning, confirmation, apply, errors, stale-revision handling, and recovery messaging in one coherent workflow.

## Decision (ADR-lite)

**Context**: P8 intentionally stopped at catalog inspection. The established next phase needs to expose P4’s transactional project-change behavior without splitting the user journey across multiple incomplete releases.

**Decision**: Implement the complete P9 workflow: staged selections, server-computed plan review, explicitly confirmed apply, and conflict/recovery UI. Guard applies with a two-step interaction: open a review view from the change bar, then open a confirmation dialog that names the project and change counts; a single explicit “Apply” action executes the reviewed plan. No typed path or confirmation phrase is required.

**Consequences**: P9 touches core browser-safe contracts, protected CLI routes/session integration, and the P8 frontend foundation. It must use the established P4 service rather than reimplement planning or filesystem mutation. The plan must be freshly computed before apply and clear stale-plan errors must return the user to review.

## Open Questions

- None blocking implementation.

## Requirements (evolving)

- Provide protected browser-safe contracts and routes for project snapshot, staged-change planning, and confirmed apply.
- Use the existing P4 project inspection/change service and P5 session operation guard; retain P4 locking, revision, idempotency, rollback, and recovery semantics.
- Extend the P8 workbench with explicit staging controls and an accessible change-review surface without conflating a default catalog candidate with a staged choice.
- Keep bearer credentials private to `LocalApiClient`; do not expose Node-only modules to the web bundle.
- Provide explicit no-project, unhealthy-project, conflict, stale-plan, in-progress, apply-success, apply-failure, and recovery-required states.

## Acceptance Criteria (evolving)

- [ ] A user can inspect the active project state, stage add/remove/replace intentions, review a server-computed plan, and explicitly confirm a safe apply.
- [ ] P9 routes enforce existing local session authentication and never accept browser-supplied filesystem targets as authoritative transaction input.
- [ ] Revision, idempotency, lock, occupancy/conflict, and recovery errors are rendered clearly and do not result in duplicate mutation.
- [ ] The catalog, project state, staged selection, plan, and result refresh consistently after an apply.
- [ ] Appropriate API/unit/integration/E2E coverage and project quality gates pass.

## Definition of Done (team quality bar)

- Tests added or updated at appropriate unit, integration, and E2E levels.
- Lint, typecheck, formatting, build, unit/integration tests, and E2E tests pass.
- Backend and frontend Trellis contracts capture durable P9 conventions.
- Project filesystem changes occur only through the existing P4 transaction flow after explicit user confirmation.

## Technical Approach

1. Add browser-safe P9 request/response contracts for the active-project snapshot, selected candidate intents, server-computed plans, and sanitized apply results/errors. Keep all core filesystem/service types behind Node-only `@skillpin/core/project` and `@skillpin/core/changes` entrypoints.
2. Add session-owned project runtime composition in the CLI: resolve selected catalog candidates only from the current scan snapshot; invoke P4 inspection/planning; wrap apply in `ManagedSession.runProjectOperation()`; create authenticated P9 routes.
3. Extend the catalog provider/workbench with an explicit staged-selection model, a persistent accessible change bar, a plan-review surface, and a confirmation dialog. Default duplicate viewing remains non-staging; every intended add/replace is user-selected.
4. Refresh catalog/project/plan state after mutations and map P4's stable errors to actionable UI states without sending filesystem paths or authority from the browser.
5. Cover contracts and route behavior, real P4-backed integration paths, client states, and the end-to-end confirmed-apply flow.

## Implementation Plan (small PRs)

1. **Backend P9 API:** shared browser-safe contracts, session project runtime, protected snapshot/plan/apply routes, and integration tests.
2. **Frontend P9 workflow:** staged selections, change bar, plan review, confirmation dialog, result/error/recovery states, and client tests.
3. **Verification and documentation:** E2E coverage, quality gates, and backend/frontend Trellis contracts.

## Out of Scope (explicit)

- Reworking P1 platform link behavior, P2 persistence formats, P3 catalog scanning, P4 transaction algorithms, P5 session security, or P7 source CRUD except for narrow integration needs.
- Multi-project orchestration, remote/shared catalog synchronization, cloud accounts, or P11 distribution/packaging work.

## Technical Notes

- P4 requirements and API contracts: `.trellis/tasks/archive/2026-08/08-26-implement-skillpin-p4-project-inspection-and-change-planning/prd.md` and `.trellis/spec/backend/project-change-transaction-contract.md`.
- P5 route/session contract: `.trellis/spec/backend/local-session-api-contract.md`; `packages/cli/src/session/session-manager.ts` documents `runProjectOperation()` for P6–P9 routes.
- P8 implementation foundation: `packages/web/src/features/catalog/`, `packages/web/src/api/local-api.ts`, and `.trellis/spec/frontend/skills-workbench-foundation.md`.
- P9 must preserve the P8 split between metadata list endpoints and explicit document detail, while adding only the narrow transaction data necessary for project operations.
