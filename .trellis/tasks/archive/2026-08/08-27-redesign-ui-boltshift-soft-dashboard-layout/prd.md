# redesign UI Boltshift soft dashboard layout

## Goal

把 SkillPin 从「侧栏 + 换皮」改成 Boltshift 式软色 SaaS 仪表盘布局与交互：顶栏分段导航、页面标题区、摘要卡、内容网格；功能逻辑与路由/API/e2e 合约不变。

## What I already know

- 用户反馈：0.1.2 近黑白 restyle 只改 token，布局/交互几乎没变。
- 参考图：Boltshift 类软浅色 SaaS — 顶品牌 + pill/segment 顶栏导航、右侧操作、页标题+筛选、KPI 卡行（一卡实心强调色 + 白卡圆标）、双栏图表、带搜索排序表格；大圆角；灰底外包白应用壳；蓝强调色。
- 现壳：`app-header` + `side-nav`（技能/技能源）+ `main-content`；`/skills` 三栏 workbench（filter | catalog | detail）；`/sources` 搜索+行列表；`/onboarding` EmptyState。
- 合约：保留 class/e2e、三栏 workbench、skip-link、theme `data-theme`、无公开 npm；quality-guidelines 现写 near B/W，本任务将改视觉语言。
- 任务目录：`.trellis/tasks/08-27-redesign-ui-boltshift-soft-dashboard-layout`（planning）。

## Open Questions

（无阻塞项 — 待最终确认）

## Requirements (evolving)

- 分析参考风格并映射到 SkillPin IA。
- 用 ASCII 与用户确认壳 + 关键页布局后再改代码。
- **壳：顶栏 pill 导航，移除 side-nav**（用户选 A）。
- **页内：B+C 全文** — skills 页头+3摘要卡+三栏 workbench；sources 页头+摘要卡+表格式面板。
- **视觉：软蓝强调** — 浅灰画布、白面板、大圆角；主色 ~`#4F6EF7`；一枚 KPI 实心蓝卡；深色主题配对蓝/面板 token（非仅 light）。
- KPI 映射真实数据（技能数/源数/已链接或启用），不做假图表。
- 功能逻辑不变：路由、session、catalog、sources、project apply。
- 保留 a11y / e2e / workbench 三栏合约；更新 quality-guidelines Styling。

## Decision (ADR-lite) — page interiors

**Context**: 用户授权自选页内布局。
**Decision**: B+C 全文（页头 + 摘要卡 + skills 三栏 / sources 表格式）。
**Consequences**: 摘要卡需从已有 catalog/sources/project 状态派生，无新 API；sources 行→表头面板主要是 CSS/markup。

## Decision (ADR-lite) — accent

**Context**: 参考图为软蓝 SaaS；现行规范近黑白。用户授权自选。
**Decision**: 软蓝强调（light+dark 配对 token），同步改 quality-guidelines。
**Consequences**: 偏离 0.1.2 monochrome；primary/按钮/实心 KPI/pill active 用蓝；语义色仍留给 status。

## Decision (ADR-lite) — shell

**Context**: 0.1.2 仅换皮；参考 Boltshift 顶栏 pill。
**Decision**: Approach A — 顶栏 segment/pill（技能|技能源），去掉侧栏。
**Consequences**: `app.tsx` 导航结构变；e2e 若依赖 side-nav 文案/角色需改查 accessible name；workbench 三栏仍在 main 内。

## Acceptance Criteria (evolving)

- [ ] 用户确认 ASCII 布局后再动 TSX/CSS
- [ ] 侧栏改为顶栏分段导航（或用户确认的替代）
- [ ] `/skills` `/sources` `/onboarding` 布局明显变化，非仅换色
- [ ] format/lint/typecheck/build/e2e 绿
- [ ] quality-guidelines Styling 更新为新视觉语言

## Definition of Done (team quality bar)

- Tests green (unit/e2e as applicable)
- Lint / typecheck / CI green
- Specs updated for new chrome language
- No public npm publish

## Out of Scope (explicit)

- 新路由/默认仪表盘页（避免违反 local-session-app-foundation 规则 59）
- 移动端底部 Tab 栏（响应式折叠抽屉保留，不加多套导航）
- 真实图表库、插画包、UI kit、webfont
- 改后端 API / 凭证模型
- 本次不自动发版（确认后再说）

## Technical Notes

- 主文件：`packages/web/src/app/app.tsx`、`styles.css`、`features/{catalog,sources,onboarding}/*`
- Specs：`quality-guidelines.md`、`local-session-app-foundation.md`、`skills-workbench-foundation.md`
- 参考交互：顶 nav pill、页头+动作、卡行、内容面板大圆角软阴影
