# 优化技能列表信息密度与筛选区

## Goal

优化技能列表页面，使用户在单屏内浏览更多技能；将筛选条件收纳为可折叠区域，默认突出搜索能力。

## What I already know

* 用户希望技能列表尽可能一屏展示多行。
* 技能描述只需要展示一行，并应在超长时截断。
* 列表行内不展示来源信息，以优先保障单屏可见行数。
* 筛选区中的“状态”和“技能源”可折叠，重点只展示搜索。
* 本轮先提交 ASCII 结构设计，待用户确认后再实施代码改动。

## Assumptions (temporary)

* 默认收起高级筛选（状态、技能源），保留其当前筛选值与结果联动。
* 折叠入口显示已生效高级筛选的数量，避免筛选条件不可见。
* 核心目标是提高技能目录的扫描效率，而非在列表中完整呈现技能元数据；来源信息仍可在详情面板查看。

## Open Questions

* 在 B（单行极限）方向的多个变体中确认最终行结构与筛选压缩方式。

## Requirements (evolving)

* 技能卡/行压缩为适合高密度浏览的单行列表布局（方案 B）。
* 描述限制为单行省略。
* 列表行不额外占用“来源”信息行。
* 搜索始终可见，状态、技能源置于可展开的“筛选”区域。
* 继续评估将筛选入口并入搜索框右侧，以进一步压缩默认筛选高度。

## Acceptance Criteria (evolving)

* [ ] 默认视图相较当前可在同等视窗显示更多技能行，采用单行列表布局。
* [ ] 每项技能描述最多一行，溢出显示省略号。
* [ ] 列表中不渲染独立来源信息行；来源信息保留在详情面板。
* [ ] 搜索框默认可见；状态、技能源可展开和收起。
* [ ] 已选高级条件在收起时仍有明确提示。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Scope Addendum

* Publish the repository under the MIT License: add the canonical `LICENSE` text, declare `MIT` in package metadata and lockfile, include the license in the npm package, link it from both README language variants, and update package archive verification to require the license.

## Out of Scope (explicit)

* 本轮不改变技能数据、排序规则、筛选语义或后端接口。
* 未经用户确认不改动应用代码。

## Technical Notes

* 待确认 ASCII 方案后，检查前端现有组件和样式约束。

## Decision (ADR-lite)

**Context**: The existing catalog toolbar and 228px multi-line rows prioritize full metadata and large typography, which prevents rapid scanning of many skills in one viewport.

**Decision**: Use compact filter F1 and single-line list B3:

* Keep one visible toolbar row containing search and a `筛选` button.
* Open status/source filters in an anchored popover; closed filters do not consume list height.
* Show an active-filter count on the button when non-default filters are applied.
* Render each row as a single line: selected indicator, fixed-width skill name, one-line truncated summary, optional compact warning mark, and a clear enable/remove action.
* Do not render source identity, candidate count, or redundant enabled/disabled text in the list; retain source/candidate information in the detail pane.

**Consequences**: The workbench must relax its prior large fixed control/row sizing in favor of compact but accessible controls, and virtualized row estimation must match the new fixed-height list row.

## Technical Approach

* Update `SkillsWorkbenchPage` filter interaction so status and source controls live in one popover anchored to a compact button beside the search input.
* Preserve keyboard behavior: Escape/outside click close the popover, and controls retain accessible labels.
* Update workbench CSS for one-row toolbar, fixed-height dense catalog rows, ellipsis behavior, and responsive fallback without clipping actions.
* Update affected end-to-end coverage for compact filters, source-hidden rows, and single-line list layout.

## Final Requirements

* Default catalog toolbar is one compact row: search plus a visible filter button.
* Filter button opens a popover containing status and source controls; closing the popover does not alter applied filters.
* Filter button reflects active non-default filter count.
* Catalog rows use B3: name-prioritized single-line rows with one-line truncated descriptions and fixed, explicit enable/remove action.
* Source context and duplicate-candidate count do not appear in catalog rows, but remain in the detail pane.
* Parse warnings retain a compact visible marker in the row.

## Final Acceptance Criteria

* [ ] In default state, the filter/search toolbar occupies one compact row.
* [ ] Status and source filters are accessible through the popover and preserve existing filtering behavior.
* [ ] The filter trigger exposes an active-filter count when at least one non-default filter is selected.
* [ ] Each catalog row is one line high, with name, truncated description, warning marker when applicable, and explicit action.
* [ ] Catalog rows contain no source, candidate count, or redundant status text.
* [ ] Existing selection, detail loading, enable/remove, empty, and error behavior remain functional.
