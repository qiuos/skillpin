# Unify Skill Typography and Add Octopath-Style Atmosphere

## Goal

Improve readability and immersion in the Skills workbench: make the "Skill sources & filters" controls match the 22px typography used by skill-list rows, then deepen the existing Octopath HD-2D visual language with restrained CSS-only decoration and motion.

## What I already know

* The user reports inconsistent type sizes between the "技能源与筛选" area and the skills list, and requests alignment with the skills-list font size.
* `packages/web/src/styles.css` currently sets `--catalog-row-text-size: 22px` for `.skill-row__name` and `.skill-row__summary`, but `--catalog-copy-size: 16px` for source/filter controls such as the catalog search and filter trigger.
* The Skills workbench is implemented in `packages/web/src/features/catalog/skills-workbench-page.tsx`; it has semantic and E2E-stable labels for `技能工作台`, `技能源与筛选`, `技能目录`, and `技能详情`.
* The current stylesheet already establishes an Octopath HD-2D base using dusk/parchment/gold/wine tokens and `.ot-window` framed panels. The task should enrich this visual language rather than introduce a separate design system.
* The frontend conventions require a single global CSS stylesheet, no external webfonts or animation libraries, preserved accessible labels/focus states, themed scrollbars, and `prefers-reduced-motion` support.

## Assumptions (temporary)

* "技能源和技能页面" refers to the Skill sources & filters panel and the skills catalog/detail workbench, rather than the separate Sources page.
* "和技能列表字体大小统一" means primary source/filter labels and controls should use the 22px skills-list row scale; compact, secondary chrome may remain smaller where needed for layout.
* The user selected the theatrical scene direction: more conspicuous CSS-only light mist, particles, layered lighting, ornamental frames, and ambient motion, while retaining usable catalog interactions and no copyrighted game assets, copied UI artwork, or new runtime dependencies.

## Open Questions

* None. The MVP visual-intensity choice is settled.

## Requirements (evolving)

* Make the Skills workbench source/filter typography consistent with the skills catalog typography.
* Increase immersion using an original, Octopath-inspired (not copied) theatrical visual treatment: layered dusk lighting, mist/particle-like CSS decoration, enhanced gold ornamentation, and noticeable but non-blocking ambient motion.
* Keep the existing keyboard, screen-reader, responsive, and reduced-motion behavior intact.

## Acceptance Criteria (evolving)

* [x] Primary text in `技能源与筛选` is rendered at the same 22px scale as skill-list row text, without clipping or unusable narrow layouts.
* [x] The workbench visibly gains original HD-2D-inspired environmental/frame decoration plus theatrical CSS-only lighting, mist/particle effects, and ambient motion without obscuring controls or text.
* [x] All ambient and interaction animation is disabled or effectively minimized under `prefers-reduced-motion: reduce`.
* [x] Existing accessible labels and E2E-visible behavior for catalog, filters, and detail remain unchanged.
* [x] Formatting, lint, typecheck, build, unit tests, and Playwright E2E checks pass.

## Definition of Done

* Tests added or updated where UI behavior changes require coverage.
* Lint, typecheck, build, and E2E checks are green.
* Specs/notes are updated if this work establishes a reusable convention.

## Out of Scope (explicit)

* Reproducing or embedding copyrighted Octopath Traveler artwork, game screenshots, music, fonts, or interface assets.
* Adding a third-party animation framework, webfont package, CSS framework, or a new settings/appearance surface.
* Changing catalog API data, selection semantics, filtering behavior, or source management logic.

## Decision (ADR-lite)

**Context**: The workbench already uses dusk/parchment/gold tokens and window frames, but the desired atmosphere is stronger than a minimal restyle.

**Decision**: Use an original theatrical, CSS-only HD-2D scene treatment, alongside a 22px primary source/filter type scale. Create depth with layered pseudo-elements/markup decoration, gentle light/mist/particle animation, and richer frame details; respect `prefers-reduced-motion`.

**Consequences**: The result is intentionally more expressive and may require responsive tuning to protect text contrast and interactive hit areas. No copied game assets or external animation dependencies are permitted.

## Technical Notes

* Likely implementation files: `packages/web/src/styles.css`, with an optional small markup hook in `packages/web/src/features/catalog/skills-workbench-page.tsx` only if CSS pseudo-elements cannot provide the required decoration.
* Relevant specs: `.trellis/spec/frontend/{quality-guidelines,component-guidelines,p8-skills-workbench-foundation}.md`.
* Existing accessibility/visual regression coverage: `tests/e2e/app.spec.ts`.
