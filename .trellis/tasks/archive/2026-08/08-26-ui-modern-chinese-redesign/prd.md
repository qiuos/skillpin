# UI 现代化中文界面改版

## Goal

把 SkillPin 本地 Web 界面改成中文、字号/触控区够大、视觉现代但不像「AI 产品模板」的工具界面，方便日常操作。

## Requirements

- 所有用户可见界面文案改为中文（shell、导航、onboarding、sources、skills、dialog/drawer、空态、状态、错误提示、aria-label）。路径、代码标识、`SKILL.md`、用户目录名、服务端原样错误消息可保留原文。
- 增大可操作控件与正文可读性：
  - 按钮 `min-height ≥ 40px`，字号 ≥ 15px
  - 输入框 `min-height ≥ 40px`
  - 侧栏项可点区域明显大于现状（≥ 40px 高）
  - 正文 ≥ 15px；去掉 11px uppercase 装饰标签作为主要信息载体
- 视觉方向：**务实工具台**（ADR 已定）
  - 中性灰底、单一沉稳蓝强调色（非紫）
  - 去掉 uppercase eyebrow / 紧 letter-spacing / 紫光选中态等模板感
  - 圆角克制，字重正常
- 中文字体栈：系统中文优先（PingFang SC / Microsoft YaHei / Noto Sans SC 等）+ 西文回退
- 保留 light/dark 主题切换（文案中文化）
- 不引入 UI 库 / i18n 框架；继续全局 `styles.css` + 现有 controls
- E2E（`tests/e2e/app.spec.ts`）与相关断言随中文 accessible name 更新

## Acceptance Criteria

- [ ] 主流程界面（引导、源列表、技能工作台、会话详情、结束会话）无英文 UI 文案残留（技术 path/code/服务端原文除外）
- [ ] 主要按钮、侧栏、输入框可轻松点击；正文字号不费眼（满足上方尺寸门槛）
- [ ] light/dark 均可读、对比足够；强调色非紫
- [ ] 无 uppercase 装饰标签作为主要导航/分区信息
- [ ] `npm run test:e2e` 与相关 web 测试通过
- [ ] 观感不像通用 AI SaaS 落地页模板

## Definition of Done

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes

## Technical Approach

1. `styles.css`：重设 CSS 变量（色板、字号、间距、圆角、字体栈）；放大 `.button` / `.text-input` / `.side-nav__item` / 列表行；去掉 uppercase 装饰规则。
2. 各页面/组件内直写中文文案（不引 i18n）；`controls.tsx` 的 aria-label 一并中文化。
3. 导航标签不用 `route.slice(1)` 英文，改为中文映射（技能 / 源）。
4. `tests/e2e/app.spec.ts` 同步中文 role name。
5. 不改 API / 业务逻辑。

## Decision (ADR-lite)

**Context**: 需同时解决中文、触控/字号、去 AI 味；有多种视觉方向。
**Decision**: 务实工具台 —— 中性灰 + 沉稳蓝、大触控、中文唯一语言、无新依赖。
**Consequences**: 改动集中在 `packages/web` 展示层与 E2E；后续若要多语言需另开任务。

## Out of Scope

- 运行时多语言切换 / i18n 框架
- 引入 React 组件库或 CSS-in-JS
- 后端/API/CLI 文案全面汉化
- 信息架构/路由重做
- 动效库、插画、新 logo 资产

## Technical Notes

- 关键文件：`packages/web/src/styles.css`、`app/app.tsx`、`app/theme.tsx`、`components/controls.tsx`、`components/error-boundary.tsx`、`features/**/*.tsx`、`tests/e2e/app.spec.ts`
- Spec：`.trellis/spec/frontend/`（quality / component / local-session / source / skills-workbench / project-change foundations）
- E2E mock 里已有中文目录名「技能目录」；UI 按钮名目前仍是英文，需对齐
