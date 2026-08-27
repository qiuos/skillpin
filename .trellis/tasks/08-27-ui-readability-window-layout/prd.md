# 优化桌面端界面可读性与窗口布局

## Goal

提升桌面端 UI 的文字可读性、主要操作的语义清晰度和窗口布局一致性：放大整体字体，将审核/应用动作统一为「启用」，区分列表与详情窗口尺寸，统一状态筛选下拉框样式，并让「技能源」采用全屏布局。

## What I already know

* 用户反馈整体字体太小、可读性差。
* 用户要求将「审查」及「应用」按钮文案改为「启用」。
* 技能列表窗口应允许更小尺寸；详情窗口应支持更大尺寸。
* 技能列表的状态筛选下拉弹窗 UI 与交互需要与整体风格统一。
* 「技能源」页面不应再以居中的小窗口呈现，需占满屏幕。

## Assumptions (temporary)

* 本次只调整现有桌面端界面的视觉与窗口行为，不新增业务能力。
* 「启用」沿用原「审查」/「应用」的业务逻辑，仅修改用户可见文案，除非代码审查发现动作含义不一致。

## Open Questions

* 无；按“占满当前应用可用窗口”实现，而不触发浏览器/操作系统的全屏模式。

## Requirements (evolving)

* 提高全局字号 token 及高频控件字号、行高和触控/点击区域，保证主要页面的文字可读性和布局不溢出。
* 将技能工作台中面向用户的“审查并应用变更”“应用变更”和最终确认“应用”等操作按钮文案统一为「启用」；保留描述文本中必要的业务说明。
* 调整技能工作台的双列网格：降低技能列表面板的最小宽度，并提高详情面板可获得的默认与最大空间；在窄窗口下仍安全地改为单列。
* 以与现有 Button/浮层一致的自定义状态筛选菜单替代原生 `<select>`：可打开/关闭、显示当前筛选、支持键盘焦点与选项选择、点击外部关闭。
* 让 `/sources` 的主内容区域和列表卡片填满当前应用可用视口，不触发浏览器/操作系统的全屏 API，也不保留居中的 1160px 小窗口。

## Acceptance Criteria (evolving)

* [x] 主要界面文本在常用显示比例下明显更易阅读，且布局不溢出或遮挡。
* [x] 用户看到的相关主操作按钮均显示为「启用」，并保有原有禁用/加载/确认行为。
* [x] 技能列表面板比当前 420px 更易缩小；详情面板比当前默认比例获得更多空间，且窄窗口下仍可访问。
* [x] 状态筛选菜单沿用应用的边框、底色、字重和交互反馈；鼠标、键盘和点击外部关闭均可正确工作。
* [x] 「技能源」视图填满当前应用窗口的内容区域，不再呈现为居中且受 1160px 宽度约束的小窗口。

## Definition of Done

* 测试已添加或更新（适用时）。
* 通过 lint、typecheck 和相关测试。
* 不破坏既有功能。

## Out of Scope (explicit)

* 不改变技能启用/审核的后端业务流程或权限规则。
* 不进行与上述 UI/窗口问题无关的整体品牌重设计。

## Technical Notes

* 项目是 React + Vite Web 应用，未发现 Electron/Tauri 的原生窗口创建代码；“窗口”对应技能工作台的两个内容面板及应用可用视口。
* `packages/web/src/styles.css` 定义全局字号 token、页面最大宽度、技能工作台的双列尺寸，以及状态筛选的原生 `<select>` 样式。
* `packages/web/src/features/catalog/skills-workbench-page.tsx` 包含状态筛选和“审查并应用变更 / 应用变更”按钮。
* `packages/web/src/app/app.tsx` 仅让 `/skills` 使用无最大宽度的工作台容器；`/sources` 仍使用最大宽度 1160px 的居中内容区。
* `packages/web/src/features/sources/source-list-page.tsx` 是“技能源”页。

## Decision (ADR-lite)

**Context**: 原生状态下拉框与现有视觉系统不一致，技能工作台和技能源页也因固定宽度造成空间利用不足。

**Decision**: 采用应用内可访问的自定义状态筛选菜单；通过现有 CSS token 提升可读性；以 CSS 网格调整工作台双列比例，并为技能源路由使用全宽、全高的主内容布局。

**Consequences**: 增加少量前端交互状态和键盘/外部点击处理；不引入新的 UI 依赖，也不改变后端启用流程。

## Implementation Plan

1. 调整全局视觉 token、工作台分栏和技能源页面容器。
2. 实现自定义状态筛选菜单并将主操作文案改为「启用」。
3. 添加/更新端到端覆盖，执行格式、lint、typecheck 和测试。

## Approval

用户于 2026-08-27 确认上述范围与实现方向。

## Validation

* `npm run format:check` — passed
* `npm run lint` — passed
* `npm run typecheck` — passed
* `npm test` — 16 files / 86 tests passed
* `npm run build` — passed
* `npm run test:e2e` — 9 Chromium tests passed
