# P8 Skills Workbench

## Goal

Build the populated Skills workspace on top of P7's session-local catalog so users with configured local sources can search discovered skills, compare duplicate candidates, inspect safe rendered Markdown, and copy the paths they need before P9 introduces any project-change staging or apply operations.

## What I already know

- P7 is complete: the browser can manage sources and P7 intentionally leaves `/skills` as a placeholder.
- P3 already defines session-local `CatalogIndex`, grouped candidates, and catalog search primitives.
- P5/P7 require all local HTTP endpoints to remain loopback-guarded, bearer-authenticated, versioned, and browser-safe through root `@skillpin/core` exports.
- The earlier P6 roadmap explicitly names P8 scope as skill search, a three-column workbench, candidate comparison, safe Markdown, path copying, and virtual lists.
- P9 owns real project-change planning, staging, apply/recovery UI, so P8 must remain read-only with no project mutations.

## Assumptions (temporary)

- P8 should expose a protected, read-only catalog API from the session runtime rather than rescan/reparse files in the browser.
- Skills are grouped by shared link name, with all discovered source candidates visible for comparison.
- `SKILL.md` rendering must be sanitized and must not execute embedded HTML/scripts; ordinary source files must not be exposed through directory-browsing endpoints.
- The workbench should use the existing P6 component, theme, routing, session-state, and API-client foundations, and should be usable with keyboard navigation.

## Open Questions

- None currently blocking implementation.

## Requirements (evolving)

- Provide a protected, typed, browser-safe read-only catalog API backed by the session-local P7 catalog snapshot.
- Render a populated `/skills` experience as a desktop three-column workbench: skill search/list, candidate comparison, and safely rendered detail. On narrow screens, collapse it into a keyboard-accessible list/detail flow. Preserve a useful empty state and route users without sources to P7 onboarding/source management.
- Support catalog search and candidate comparison without mutations. For a multi-candidate group, select the first candidate in the catalog's stable order by default; show every candidate and do not present the default as a recommendation or P9 selection.
- Render selected `SKILL.md` content using `react-markdown` and standard/GFM Markdown while ignoring raw HTML. Permit only `https:`, `http:`, and relative links; apply safe new-window link behavior for external links; do not render remote images. Provide accessible path-copy affordances.
- Avoid rendering unbounded catalogs inefficiently; use list virtualization or another demonstrably scalable approach.

## Acceptance Criteria (evolving)

- [ ] A configured, scanned source produces a searchable skills list in `/skills` without exposing Node-only modules to the web bundle.
- [ ] A user can choose a skill group, compare its source candidates, and inspect a safely rendered Markdown detail view.
- [ ] Source, candidate, and local paths can be copied without exposing bearer credentials or enabling project changes.
- [ ] No-source, failed-scan, and no-skills catalog states are explicit and navigable.
- [ ] Keyboard, focus, labels, and responsive behavior remain consistent with P6/P7 foundations.
- [ ] Relevant automated tests cover API behavior, workbench states, safe rendering/copy interaction, and the project quality gates pass.

## Definition of Done (team quality bar)

- Tests added or updated at appropriate unit/integration/e2e levels.
- Lint, type-check, formatting, unit tests, e2e tests, and web build pass.
- Cross-layer contracts and Trellis specs are updated if this task establishes durable conventions.
- No project filesystem links, manifests, or source files are mutated by P8 interactions.

## Out of Scope (explicit)

- P9 project-change selection, plan/apply endpoints, transaction execution, conflict resolution, recovery, and bottom change bar.
- P7 source CRUD, filesystem directory browsing changes, or source configuration format changes unless a narrowly necessary read-only catalog contract requires it.
- P11 packaging/static-asset distribution work.

## Technical Notes

- Relevant P7 backend contract: `.trellis/spec/backend/source-management-api-contract.md`.
- Relevant P7 frontend contract: `.trellis/spec/frontend/source-management-foundation.md`.
- Catalog primitives and tests currently live under `packages/core/src/catalog/`.
- The likely affected areas are `packages/core/src/api/`, `packages/cli/src/session/`, `packages/cli/src/server/routes/`, and `packages/web/src/`.
- **Confirmed UX decision (August 26, 2026):** desktop three-column workbench, collapsing into list/detail on narrow screens.
- **Confirmed content-security decision (August 26, 2026):** render source Markdown with `react-markdown` and GFM; ignore raw HTML, allow only `http(s)`/relative links, treat external links safely, and do not render remote images.
- **Confirmed duplicate-detail decision (August 26, 2026):** show the first candidate in existing stable catalog order by default, expose all candidates for comparison, and never imply that the default is a P9 project selection or recommendation.
- `@skillpin/web` currently has no Markdown/rendering or virtualization dependency; new dependencies require a concrete accessibility/security justification and lockfile update. Use `react-markdown` plus `remark-gfm` for the constrained renderer and `@tanstack/react-virtual` for the long vertical skills list. Configure its React adapter with `useFlushSync: false` for the documented React 19 lifecycle-warning compatibility path.
- Parser output already separates front matter from `markdownBody`, so a read-only detail endpoint can return a selected candidate document without broad file browsing.
