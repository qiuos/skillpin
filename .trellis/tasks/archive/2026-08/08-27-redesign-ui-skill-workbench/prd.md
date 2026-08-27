# redesign UI skill workbench

## Goal

把 SkillPin 前端从 Invoicer soft-blue「侧栏 + KPI 仪表盘」改成**歧路旅人 HD-2D 风格技能选择工作台**。功能逻辑 / 路由 / API 不变；e2e 按 role/name 对齐，可改 class 与视觉。

## Requirements

- 无侧栏。顶栏 = `SkillPin` + `技能`/`技能源` 切换 + 连接态 + `结束 SkillPin`。
- 无「会话详情」按钮、无「掌机像素工作台」副标题、无 KPI 大卡。
- `/skills`：搜索 + 紧凑列表（行内直接勾选暂存）+ 右常驻只读详情（名 / 摘要 / SKILL.md / 候选来源；无路径、无详情内操作）。
- 底命令带固定：已选计数 + `清空选择` + `审查并应用变更`；按钮文字完整显示。
- `/sources`：同顶栏语言，搜索 + 行表 + 行内操作，无 KPI。
- `/onboarding`：同顶栏，居中 empty。
- 视觉：暮色画布、羊皮纸窗、古董金双线框、四角钉、暗红光标；浅色羊皮纸为主。
- 无 webfont / Tailwind / motion lib；单 `styles.css`；系统衬线栈模拟 HD-2D。
- 保留 skip-link、`nav[aria-label="SkillPin 功能分区"]`、workbench aria、`data-theme` + `skillpin.theme`。主题切换收入结束流程旁或身份条次级，不恢复「会话详情」抽屉入口。
- 更新 quality-guidelines / foundation Styling。

## Acceptance Criteria

- [x] ASCII 布局经用户确认
- [x] 本地 HTML demo（v4 歧路旅人）经用户确认
- [x] `/skills` `/sources` `/onboarding` 布局变为无侧栏工作台，非仅换色
- [x] 列表可直接勾选；底命令带固定可见
- [x] 详情无路径与操作按钮
- [x] 顶栏露出产品名、连接状态、结束连接
- [x] 按钮文字不截断、不折行、不折叠成图标
- [x] format/lint/typecheck/build/e2e 绿
- [x] quality-guidelines / foundation Styling 更新

## Definition of Done

- Tests green (e2e)
- Lint / typecheck / build green
- Specs updated for new chrome language
- No public npm publish；本次不自动发版

## Technical Approach

- `packages/web/src/app/app.tsx`：去掉 `.side-nav`；顶栏承载 brand + nav + 连接态 + 结束。
- `skills-workbench-page.tsx`：去掉 KPI 与独立筛选栏；筛选并入列表工具条；列表行 checkbox 绑定 staged；详情精简；底命令带固定。
- `source-list-page.tsx` / `onboarding-page.tsx`：去 KPI，套羊皮纸窗。
- `styles.css` + `theme.tsx`：token 换成 HD-2D 羊皮纸/金框；dark 用更深暮色，仍浅纸窗。
- e2e 断言按 accessible name；「结束 SkillPin」文案保留。若测试依赖「会话详情」，改为通过主题控件或连接态进入同等信息，或更新断言。

## Decision (ADR-lite)

**Context**: 用户确认 v4 demo，要求正式改代码。
**Decision**: 无侧栏歧路旅人指挥台；列表直选 + 底命令带；详情只读。
**Consequences**: Invoicer 浮壳与 KPI 语言删除；theme drawer 入口需另置。

## Out of Scope

- 新路由 / 默认仪表盘页
- 真图表库、插画包、UI kit、webfont、Framer Motion
- 改后端 API / 凭证模型
- 移动底 Tab
- 自动发版

## Technical Notes

- 主文件：`packages/web/src/app/app.tsx`、`styles.css`、`theme.tsx`、`features/{catalog,sources,onboarding}/*`、`components/controls.tsx`
- Specs：`quality-guidelines.md`、`local-session-app-foundation.md`、`skills-workbench-foundation.md`、`source-management-foundation.md`、`component-guidelines.md`、`project-change-workflow-foundation.md`
- Demo：`.trellis/tasks/08-27-redesign-ui-skill-workbench/demo/workbench-demo.html`
- 任务目录：`.trellis/tasks/08-27-redesign-ui-skill-workbench`
