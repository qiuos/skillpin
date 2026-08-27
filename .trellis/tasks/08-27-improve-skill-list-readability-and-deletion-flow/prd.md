# Improve skill list readability and deletion flow

## Goal

Make the skills workbench readable on first entry, render both workbench windows at their full intended size without refreshing, and replace staged/batch skill changes with single-skill direct actions.

## What I already know

* The user reports skill-list titles and supporting copy are still too small to read; skill-detail text needs the same treatment.
* The requested baseline is that skill-list text must be no smaller than operation-button text.
* The user needs a temporary typography debugger, to be removed once they provide final numeric font sizes.
* On the first entry to the skills page, the catalog and detail panels can render as small windows; a page refresh shows their full-size layout.
* Batch selection and batch application are not wanted.
* Removing a skill must happen directly from its list row, without a confirmation dialog.
* The current workbench (`packages/web/src/features/catalog/skills-workbench-page.tsx`) stages changes locally, renders a bottom command bar, opens a confirmation dialog, and applies the staged set in one request.
* Current workbench body tokens are nominally 16–17px, but list/detail text still does not meet the user's perceived legibility requirement.
* The workbench is a nested flex/grid layout; its windows depend on flex height propagation from `.application` → `.app-shell` → `.workspace` → `.main-content--workbench` → `.skills-workbench` → `.skills-columns`.

## Requirements

* Increase skill list title, summary, status/source metadata, and skill-detail prose/metadata sizes so primary list and detail content is clearly legible and list text is no smaller than operation-button text.
* Rebalance list row sizing, line heights, panel spacing, and virtualized-row measurement to accommodate the larger typography without clipping.
* Add an intentionally temporary, skills-page-only “文字调试” panel with numeric controls for the list name, list summary/metadata, and detail-content font sizes. It must display the active pixel values and be self-contained so it can be deleted after the user supplies final sizes.
* Make the workbench window layout resilient to its first measured render: both catalog and detail panels must fill the available work area on initial navigation, without relying on refresh or delayed content measurement.
* Remove staged selections, pending status, the bottom batch command bar, and the project-change confirmation dialog from the skills workbench.
* Keep one explicit row-level action per skill: unenabled skills can be enabled directly; enabled skills can be removed directly.
* For each direct action, retain the existing server-side project-plan/blocker validation and transaction API, but automatically apply the one-skill selection when validation succeeds. No browser confirmation dialog is shown for removal (or for the equivalent direct enable flow).
* Preserve loading/error feedback and refresh project state if a direct action fails.
* Update E2E coverage for direct single-skill enable/removal, removed batch/confirmation UI, typography controls, and first-render full-height layout.

## Acceptance Criteria

* [ ] The list name, summary, and metadata render at or above the operation-button font size; detail summary, metadata, Markdown body, and Markdown headings are visibly larger and readable.
* [ ] The temporary “文字调试” control exposes and updates the three stated sizes in pixels during the current page session; active values are visible.
* [ ] On a fresh `/skills` navigation, the list and detail panels have their available full height after initial data rendering; the E2E test does not refresh the page to establish this state.
* [ ] There are no staged-selection states, no “已选择 N 项技能” command bar, and no skills-project confirmation dialog.
* [ ] Clicking a row-level “移除” performs exactly one plan request and one apply request for that skill with no confirmation dialog; blockers/errors do not apply the change.
* [ ] The equivalent direct enable action works for an unenabled skill.
* [ ] Format check, lint, typecheck, tests, build, and E2E pass.

## Definition of Done

* Relevant E2E coverage and frontend Trellis contract are updated.
* The typography-debugger UI is clearly isolated and documented as temporary.
* Existing backend transaction, authorization, conflict, idempotency, and recovery behavior remain unchanged.
* Project quality gates pass.

## Technical Approach

1. Replace `staged`, `plan`, confirmation-dialog, and command-bar state with a single in-flight row action. A direct action will request a one-item server plan, reject blockers/empty plans, then apply it using the returned revision and a new request ID.
2. Keep all irreversible file changes behind the existing server plan and apply APIs; the change is to remove browser-side staging/batching/confirmation rather than bypassing backend safety.
3. Use CSS custom properties scoped to `.skills-workbench` for typography. The temporary panel will update `--skill-list-name-size`, `--skill-list-copy-size`, and `--skill-detail-content-size` in React state and reveal their current `px` values.
4. Set a noticeably larger initial readable baseline (rather than only the old 16–17px body tokens), revise list row/virtualizer size to match, and size Markdown headings relative to the adjustable detail value.
5. Strengthen the nested flex/grid sizing contract with explicit `height: 100%` / `min-height: 0` propagation where required, and have the list virtualizer recompute after the page receives a real element size using `ResizeObserver`.
6. Update Playwright’s mock controls to count plan/apply requests; assert direct operations issue one of each, confirmation/command bar are absent, typography control works, and fresh render fills the work area.

## Decision (ADR-lite)

**Context**: The previous staged/batch operation flow adds selection and confirmation work even when the user is managing one skill. Its small text and a layout sizing race also make the workbench hard to use.

**Decision**: Move to immediate per-row project actions while retaining backend plan/apply validation; add a temporary per-workbench pixel debugger and harden the workbench sizing chain/virtualizer measurement.

**Consequences**: Removing a skill becomes a one-click effect, so it is intentionally not undoable through a browser confirmation. Backend validation and errors remain the safety boundary. The temporary debug control is deliberately local in scope and must be removed after typography is finalized.

## Out of Scope

* Final typography values, which the user will provide later.
* Changing backend project-link transaction behavior, authorization, recovery policy, or API contracts.
* Broad redesigns of the rest of the application or source-management removal behavior.

## Technical Notes

* Primary implementation: `packages/web/src/features/catalog/skills-workbench-page.tsx`.
* Styles: `packages/web/src/styles.css`.
* Browser acceptance: `tests/e2e/app.spec.ts`.
* Relevant current contract: `.trellis/spec/frontend/skills-workbench-foundation.md` and `.trellis/spec/frontend/project-change-workflow-foundation.md`.
* E2E’s protected local API currently supports a project snapshot, plan response, and apply count. It will be extended to assert the direct-action request sequence.

## Approval

User confirmed the above scope and technical approach on 2026-08-27.

## Validation

- `npm run format:check` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: 16 test files / 86 tests.
- `npm run build` — passed.
- `npm run test:e2e` — passed: 11 Chromium tests.
- `git diff --check` — passed.
