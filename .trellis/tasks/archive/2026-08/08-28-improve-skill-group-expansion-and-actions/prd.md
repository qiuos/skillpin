# Improve skill group expansion and actions

## Goal

Improve the skill-group workflow so users choose a group from the skill list and expand it inline to inspect/select its skills, while simplifying group-level actions to full enable or remove only.

## What I already know

* The current skill-group interaction uses an accessible modal popup (`Dialog`) in `packages/web/src/features/catalog/skills-workbench-page.tsx`.
* Directory groups currently render as one virtualized list row and show “技能组 · 包含 N 个技能 · X / N 已启用”.
* Users should instead expand a skill group from the skill list, reuse the existing skill-detail styling, and select its child skills there to display their details in the persistent right-hand detail pane.
* The group action labelled “启用剩余 xx” and its remaining-enable logic must be removed.
* Group-level actions should be consistently limited to “全部启用” and “移除”.
* The source scan-warning dialog repeats its non-blocking-use notice, renders at least some warning messages in English, and does not make the underlying cause/action clear.
* The current Playwright coverage is `manages a directory skill group in one row and supports batch and individual actions` in `tests/e2e/app.spec.ts`.

## Requirements

* Clicking a skill-group row expands/collapses its members inline in the skill list; no skill-group dialog is opened.
* At most one group is expanded at a time; expanding another group collapses the previously expanded one.
* Each expanded member reuses the visual and interaction pattern of an existing single-skill row. Selecting it updates the persistent Skill Detail panel; individual enable/remove actions remain available.
* The virtualized catalog remeasures after a group is expanded or collapsed.
* Group batch controls are always visibly labelled “全部启用” and “移除”. “全部启用” targets every member; “移除” removes all currently enabled group members. No “启用剩余 N 项” copy or remaining-enable branch remains.
* Show the non-blocking scan-warning notice once only.
* Never display raw English scanner messages or raw OS error text in the source-warning dialog.
* For each scan warning, display a Chinese title, a specific user-readable cause based on the filesystem failure category when available, the affected path, and a concise remediation suggestion.
* Filesystem reason categories cover permission denied, missing path/link target, symlink loop, and a safe generic fallback.

## Open Questions

* None — user confirmed the inline group interaction and scan-warning presentation on August 28, 2026.

## Acceptance Criteria

* [ ] A skill group expands from the skill list without opening the previous group modal.
* [ ] Expanded content lets users inspect and select group skills using the established skill-detail visual language.
* [ ] No “启用剩余” copy or remaining-enable behavior remains.
* [ ] Group actions offer “全部启用” and “移除”.
* [ ] The source-warning dialog contains one non-blocking-use notice only.
* [ ] An unreadable child directory warning is fully presented in Chinese, including a concrete reason category, its path, and a suggested next step.
* [ ] Known filesystem causes (for example, permission denied, missing path/link target, or symlink loop) render a matching Chinese explanation; unknown causes use a safe generic explanation rather than raw system text.

## Definition of Done

* Tests added or updated where appropriate.
* Lint, typecheck, and relevant tests pass.
* Docs/notes updated if behavior changes.

## Out of Scope (explicit)

* Redesigning unrelated skill-list or skill-detail interactions.
* Changing group deletion semantics beyond the requested UI/action simplification.
* Adding a general internationalization framework beyond the scan-warning copy and diagnostics.

## Technical Approach

* Replace modal-oriented `openSkillGroupId` behaviour with a single expanded group in the virtualized catalog. Render the group row plus its measured inline member rows, and reuse the existing `selectSkill` / Skill Detail selection path.
* Replace the toggling group action helper with explicit enable-all and remove-enabled selection builders, preserving the existing project plan/apply workflow.
* Extend the core/API source-warning contract with a stable optional filesystem reason category. The scanner derives it from known filesystem error codes; the React source-warning dialog owns Chinese title, reason, and remediation copy. The raw scanner text is not rendered.
* Update core/API, React, CSS, Playwright, and repository specs together so the data contract and behavior remain aligned.

## Decision (ADR-lite)

**Context**: The modal separates group members from the normal skill selection/detail flow, and group action copy changes based on a remaining-count branch. Source warning UI repeats non-blocking information and leaks raw English diagnostic text without a practical cause.

**Decision**: Use one inline-expanded group in the catalog, retain child-level actions and existing right-hand detail inspection, and expose fixed group controls: “全部启用” and “移除”. Classify scanner filesystem failures at the core/API boundary and translate them to actionable Chinese warning cards in the frontend.

**Consequences**: Catalog virtual measurements must adapt to expanded height. API warning types and their tests change. Raw low-level errors stay private, while known causes gain reliable user-facing treatment.

## Technical Notes

* Initial task created August 28, 2026.
* Likely implementation files: `packages/web/src/features/catalog/skills-workbench-page.tsx`, `packages/web/src/styles.css`, and `tests/e2e/app.spec.ts`.
* The existing virtualized catalog uses a fixed compact-row estimate and `measureElement`; the inline expanded section must remeasure accurately after opening/closing.
* Existing persistent Skill Detail already supports selecting a `LocalCatalogGroup`; child entries can reuse that selection path rather than duplicating detail rendering.
* Current P8 specs prescribe a modal. Once implementation is approved, update the spec to record the inline-expansion convention.
* The warning UI currently duplicates the notice: the `Dialog` description says warnings do not affect normal use, and its body repeats “你仍可正常使用此技能源中的技能。”.
* `SourceScanWarning` / `LocalSourceWarning` currently exposes only a broad code, raw `message`, and `path`. The scanner has raw English messages for `UNREADABLE_DIRECTORY` and presently discards the caught filesystem error in child-directory branches.
* A cross-layer change is required: capture a stable filesystem reason category in the core/API warning contract, then map it to Chinese explanatory copy in `source-list-page.tsx`; do not expose raw OS error text.
