# redesign UI soft-blue Invoicer shell

## Goal

把 SkillPin 从前端 Boltshift **顶栏 pill 导航** 彻底改成 Invoicer.ai 式 **深色外包画布 + 白浮层应用壳 + 左侧栏导航 + 顶问候栏**；页面内布局、交互动效同步重做。功能/路由/API/e2e 合约不变。

## What I already know

- 用户：完全重构、完全不同设计风格；UI + 交互动效全改；对标百万年薪审美；参考 Invoicer.ai soft-blue 截图；完成后自动验收；抛弃现 Boltshift 样式。
- 现壳（0.1.3 / Boltshift）：`app-header` 顶栏 brand + `top-nav` pill（技能|技能源）+ project-identity + actions；灰画布 `#f4f5f8` / 深 `#0f1117`；primary `#4f6ef7`；KPI 卡 + 内容面板。
- 参考图：深蓝 outer canvas + 几何装饰；白圆角 floating app shell 大阴影；**左 sidebar**（logo、nav、badge、底部 Support/user）；顶栏 greeting + 搜索感 + 主 CTA + 通知/设置/头像；中内容 + 右 Preview。
- 合约必须保留：
  - 路由 `/onboarding` `/sources` `/skills`；无 dashboard 默认页
  - `nav[aria-label="SkillPin 功能分区"]`（可改 class，不可丢 accessible name）
  - banner 含 `SkillPin`；skip-link；`data-theme` light/dark/system + `skillpin.theme`
  - workbench：`aria-label` 技能工作台 / 技能源与筛选 / 技能目录 / 技能详情；三栏
  - 文案按钮：添加第一个技能源、会话详情、结束 SkillPin、搜索技能源、搜索技能、暂存到项目…
  - 无 webfont / motion lib / Tailwind；单 `styles.css`
  - 凭证不进 localStorage/URL
- 主文件：`packages/web/src/app/app.tsx`、`styles.css`、`features/{catalog,sources,onboarding}/*`、`components/controls.tsx`
- Specs：`quality-guidelines.md`、`local-session-app-foundation.md`（Styling 段需改）

## Assumptions (locked — user: 不问继续)

- **壳 = Invoicer 全量映射**：outer deep-blue canvas + floating white shell + left sidebar + top bar。非仅换色。
- **导航回左侧栏**（与上一任务顶栏 pill 相反）；`aria-label="SkillPin 功能分区"` 保留在 sidebar `nav`。
- **顶栏**：问候/页标题区 + 项目路径芯片 + 连接态 + 会话详情/结束；无假搜索/假通知。
- **页内**：保留 KPI 真实数据映射；skills 三栏 workbench 嵌在 shell 主区；sources 表格式面板；onboarding 居中 empty。
- **动效**：CSS-only（shell 入场、nav active、卡片 hover、drawer slide）；`--transition` 可调到 ~180–220ms。
- Light 默认对齐参考图；dark 配对深蓝壳 + 深面板。

## Open Questions

（无 — resume 授权直接收敛 MVP）

## Requirements

- 应用根：`.application` = 深色 outer canvas（几何装饰伪元素）+ 内层 `.app-shell` 白/raised 大圆角浮层。
- 左 `.side-nav`：brand mark + 分区 nav（技能/技能源，有源时）+ 底部会话快捷（主题入口可仍在 Drawer）。
- 右主列：`.app-topbar`（greeting/eyebrow + h1 上下文或页名 + actions）+ `.workspace` main。
- `/skills`：页头 KPI + 三栏 workbench（合约 class/aria 保留）。
- `/sources`：KPI + source-panel 表。
- `/onboarding`：居中 empty-state，无侧栏分区或侧栏仅 brand。
- 交互动效：shell 轻微 scale/fade 入场；nav item active 指示条/软底；button/kpi/row hover lift；drawer/dialog 已有 overlay。
- 更新 `quality-guidelines.md` Styling + `local-session-app-foundation.md` chrome 描述为 Invoicer-style shell。
- format/lint/typecheck/build/test:e2e 全绿。

## Acceptance Criteria

- [ ] 视觉：深色 outer + 白浮层壳 + 左 sidebar，不再是 Boltshift 顶栏 pill 主导
- [ ] e2e `tests/e2e/app.spec.ts` 全绿（accessible names/文案不变）
- [ ] skip-link、theme、三栏 workbench、无 dashboard 文案
- [ ] `npm run format:check && lint && typecheck && build && test:e2e` 绿
- [ ] quality-guidelines / local-session-app-foundation Styling 已改新语言

## Definition of Done

- Tests green (e2e)
- Lint / typecheck / build green
- Specs updated for new chrome language
- No public npm publish；本次不自动发版

## Decision (ADR-lite) — shell

**Context**: 用户要完全不同于 Boltshift 顶栏；参考 Invoicer 左栏浮壳。
**Decision**: 深色 canvas + floating app shell + left sidebar + topbar；nav accessible name 保留。
**Consequences**: `app.tsx` DOM 重组；CSS 大改；e2e 仍按 role/name 断言故 class 可换。

## Decision (ADR-lite) — no fake chrome

**Context**: 参考图有搜索/通知/Upgrade 卡。
**Decision**: 不造假功能控件；顶栏用真实会话/项目/连接态；侧栏底用真实结束/详情入口可放 topbar 保持 e2e 按钮名。
**Consequences**: 视觉对齐结构，不引入死按钮。

## Out of Scope

- 新路由 / 默认仪表盘页
- 真图表库、插画包、UI kit、webfont、Framer Motion
- 改后端 API / 凭证模型
- 移动底 Tab；响应式侧栏折叠用 CSS 即可
- 自动发版

## Technical Approach

1. `app.tsx`：结构改为 application > app-shell > side-nav + app-main(topbar + workspace)
2. `styles.css`：token（outer canvas 深蓝、shell radius ~20–24px、大阴影）；重写 chrome；保留组件 class 语义
3. 页内微调 class 间距以适配 shell 内边距；KPI/workbench 视觉升级（更软阴影、更清晰 active）
4. 更新两份 frontend spec Styling
5. 跑全套验收

## Technical Notes

- e2e 关键选择器：`getByRole("banner")`+SkillPin、`navigation` name `SkillPin 功能分区`、headings/buttons 中文文案、`getByLabel` 工作台四 label
- banner：侧栏 brand 或 topbar 需在 `<header>`/`role=banner` 内含 SkillPin 文本 — 用 `<header class="side-nav">` 或 topbar 作 banner；**一个** banner 即可。采用：outer 无 banner，`header.app-topbar` 含 brand 短名 + 侧栏也有 SkillPin — Playwright `getByRole("banner")` 取第一个。将 **topbar 或 side-nav 之一** 设为 `<header>`。推荐 **side-nav 为 `<header>`** 含 SkillPin，topbar 用 `<div>`；或 topbar 为 header。参考图侧栏像 chrome——用 **`<aside class="side-nav">` + `<header class="app-topbar">` 含 brand 文本「SkillPin」** 更稳（banner 断言）。
- 任务目录：`.trellis/tasks/08-27-redesign-ui-soft-blue-style`
