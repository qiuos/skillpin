# Fix skill tab default selection and large-type layout

## Goal

Make the SkillPin skills workbench enter the skill-management tab by default, render its catalog and detail panes at full available height on the initial app launch, and accommodate the newly specified large typography without overlap, clipping, or unusable controls.

## What I already know

* The user reports that a fresh SkillPin launch does not select the Skills tab by default and the skills catalog/detail panes do not fill the viewport.
* The requested final typography is: skill title `32px`; all other skills-workbench text, including action button labels, `24px`.
* A temporary typography debugger was introduced in the preceding task and must be removed now that exact font values are known.
* The prior implementation includes initial-size handling for the virtualized catalog and workbench full-height CSS; this task must identify and close the remaining initial-launch path.

## Requirements (evolving)

* Default to the Skills tab when SkillPin starts, while preserving explicit deep-link navigation behavior.
* On first launch, render both the skills catalog and detail panes using the full available application viewport, without requiring a reload.
* Apply a `32px` font size to skill titles.
* Apply a `24px` font size to all remaining workbench text, including list metadata/status, detail text, filters, empty states, and action button labels.
* Rework dimensions, spacing, wrapping, overflow, and responsive behavior so large text and controls do not overlap, clip, or obscure one another.
* Remove the temporary typography debug control and its session-only override implementation.

## Acceptance Criteria (evolving)

* [x] A fresh application launch opens with the Skills tab selected.
* [x] A fresh Skills-page navigation shows catalog and detail panes at full working height without a browser reload.
* [x] Skill titles render at 32px; all other specified workbench text and row-action labels render at 24px.
* [x] Long titles, metadata, detail prose, filters, empty messages, and direct-action buttons wrap/scroll safely without overlap or clipping at supported viewport widths.
* [x] No temporary typography debug UI or override code remains.
* [x] Automated tests cover the default-tab / first-layout behavior and typography/layout contract where practical.

## Definition of Done

* [x] Relevant unit/E2E tests are updated and pass.
* [x] Format, lint, typecheck, test, build, and E2E checks pass.
* [x] Frontend specs are reviewed and updated with the startup routing and large-type layout convention.

## Out of Scope

* Changing the direct per-row enable/remove transaction behavior.
* New bulk actions or confirmation dialogs.
* Altering typography outside the skills workbench.

## Technical Notes

* Likely files: `packages/web/src/features/catalog/skills-workbench-page.tsx`, route/shell navigation state, `packages/web/src/styles.css`, and `tests/e2e/app.spec.ts`.
* Existing relevant specifications are under `.trellis/spec/frontend/`.

## Decision (ADR-lite)

**Context**: The app has configured sources after a normal startup, but the root route currently resolves to onboarding and the workbench needs final large typography instead of an exploratory debugger.

**Decision**: Resolve unspecified startup routes to `/skills`; keep explicit workspace deep links intact. Replace session typography variables/debug controls with fixed workbench CSS variables (`32px` title, `24px` other workbench copy and actions), then increase pane/row/control constraints and use wrapping or independent scrolling at narrow sizes.

**Consequences**: Existing root navigation with configured sources now lands in the skills workbench. The temporary debug test is replaced with fixed typography and overflow/layout assertions. Typography calibration can be reintroduced later only as a new, isolated requirement.

## Technical Approach

1. Change initial route resolution for an unspecified pathname to skills; retain onboarding rendering whenever no sources exist.
2. Remove temporary typography React state, CSS custom-property injection, panel markup, and debugger tests.
3. Define final, workbench-scoped type variables and resize the catalog/detail structures around them; permit toolbars and row actions to wrap rather than overlap, while retaining full-height desktop panes and stacked narrow layouts.
4. Add fresh-root navigation and first-render geometry/typography Playwright coverage.
