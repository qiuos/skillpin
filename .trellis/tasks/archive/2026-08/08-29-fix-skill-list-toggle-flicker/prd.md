# Fix skill list toggle flicker

## Goal

Eliminate visible flickering of each skill-list item's enable control and description at the default display scale, while preserving the existing enabled/disabled behavior and layout.

## What I already know

* The user reports that the skill list's enable button and description flicker.
* Changing the display zoom/scale makes the flicker disappear, suggesting a rendering/layout invalidation issue rather than a persistent data error.
* This task targets the existing skill-list UI only.

## Assumptions (temporary)

* The issue occurs in the desktop application's standard/default scale setting.
* The flicker continues while the list is completely idle, which rules out user interaction as its primary trigger.
* The leading hypotheses are a resize/virtualization measurement loop or a compositing issue caused by continuously animated visual layers.

## Open Questions

* None.

## Decision (ADR-lite)

**Context**: The flicker persists while the list is idle and disappears after a display-scale change. The catalog has both a virtualized list and a list-level `ResizeObserver` that eagerly forces virtualizer measurement.

**Decision**: Remove or tightly constrain the redundant list-level measurement trigger, relying on the virtualizer's native row measurement for regular list rendering. Preserve the existing decorative background animations unless the focused change fails to resolve the issue.

**Consequences**: This retains the catalog design and interaction model while eliminating a likely subpixel resize/reflow loop. The behavior will be guarded by existing enablement coverage and targeted regression checks where feasible.

## Requirements (evolving)

* Identify and remove the rendering/layout or compositing behavior that causes the enable control and description to flicker while the list is idle.
* Preserve the functional behavior of enable controls and skill descriptions.

## Acceptance Criteria (evolving)

* [x] At the default scale, skill-list enable controls and descriptions remain visually stable while the list is idle and during normal list use.
* [x] Changing a skill's enabled state still works correctly.
* [x] Relevant automated checks pass.

## Definition of Done (team quality bar)

* Tests added/updated where appropriate.
* Lint / typecheck / CI green.
* Docs/notes updated if behavior changes.
* Rollout/rollback considered if risky.

## Out of Scope (explicit)

* Redesigning the skill list.
* Changing skills' underlying enablement data model.

## Technical Approach

* Stop invoking full virtualizer measurement for idle container resize notifications unless a genuine catalog structural change requires it.
* Retain virtualized rows and direct enable/remove actions; validate the UI remains functional at normal viewport sizes.

## Technical Notes

* `packages/web/src/features/catalog/skills-workbench-page.tsx` renders the catalog via `@tanstack/react-virtual`; its built-in scroll-element observation handles size changes, while explicit `rowVirtualizer.measure()` calls remain limited to catalog structural changes.
* `packages/web/src/styles.css` absolutely positions virtual rows and applies three infinite animated visual layers behind the workbench; the issue disappears after changing display scale, consistent with measurement/compositing sensitivity to fractional pixels.
* Existing browser coverage is in `tests/e2e/app.spec.ts`, including direct enable/remove behavior. The full suite passed after the fix (13 Chromium tests).
* Validation passed: `npm test` (91 tests), `npm run build`, `npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run test:e2e` (13 tests).
