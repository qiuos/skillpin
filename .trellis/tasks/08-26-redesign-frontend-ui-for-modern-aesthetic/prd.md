# Redesign frontend UI for modern aesthetic

## Goal

把 SkillPin 浏览器端视觉升级到 **Vercel / Stripe 级产品审美**：近黑白色板、强字阶与留白、精致边框/表面；**功能逻辑、路由、API、无障碍与 e2e 语义不变**。

## Requirements

- 气质：**Vercel / Stripe 产品风**（非 Linear 高密度、非 glass）。
- 色板：**近黑白 + 黑/白 primary**；accent 克制；弃用高饱和蓝主色；light/dark/system 三档成对完整。
- 字体与动效：**系统字体栈** + **CSS-only** 短过渡（~150–200ms）；零新字体文件、零动效库。
- 空状态：升级 EmptyState 排版/间距；轻量 CSS/内联 SVG 几何；无插画资产包。
- 覆盖面：shell（header/side-nav）、onboarding、sources（列表/对话框/目录浏览器/健康）、skills 三栏 workbench、dialog/drawer/tooltip/badge/input/button、empty/loading/skeleton、窄屏断点视觉。
- 实现策略：优先重写/升级 `packages/web/src/styles.css` token 与组件类；TSX 仅在视觉必需时微调 class/结构 markup；**不改** context、API client、路由表、业务文案语义。
- 测试：typecheck 绿；若 class/role/文案选择器影响 Playwright，同步测例，不改断言业务含义。
- Spec 契约保持：P6 chrome/theme/focus、P7 source UI、P8 workbench 三栏与安全 Markdown、窄屏 drawer。

## Acceptance Criteria

- [ ] `/onboarding`、`/sources`、`/skills` 视觉统一为近黑白产品风，无明显旧蓝灰残留
- [ ] light 与 dark 均可读；正文/次要文字/边框层次清晰；primary 按钮在两主题下对比足够
- [ ] 键盘 focus ring 与 skip-link 仍可用且风格一致
- [ ] skills 三栏 workbench 与窄屏 filter/detail drawer 行为不变
- [ ] 连接态、源增删改、catalog 搜索/详情/copy 等功能行为不变
- [ ] `packages/web` typecheck 通过；相关 e2e 绿（含因 class 变更而同步的选择器）

## Definition of Done

- typecheck / 相关前端与 e2e 绿
- 无未批准新运行时依赖
- 若 token/视觉约定成为新常态，按需回写 `.trellis/spec/frontend` 相关 foundation 笔记
- 无功能 scope creep

## Technical Approach

1. 重建 CSS 设计 token（canvas/panel/surface/text/border/primary/danger/radius/shadow/font-size/space）。
2. 按 Vercel 语汇重绘 `.button*`、`.badge*`、`.text-input`、`.dialog`、`.drawer`、`.side-nav*`、`.app-header*`、workbench 列与列表行、empty/loading。
3. 必要时微调 `app.tsx` / `controls.tsx` / feature 页 markup（加 wrapper class，不改逻辑）。
4. 跑 typecheck + 相关 Playwright；修选择器。

## Decision (ADR-lite)

**Context**: 全站「太丑」→ 现代产品级重设计；用户多次授权实现方择优。  
**Decision**:
1. Vercel / Stripe 产品风  
2. 近黑白 + 黑/白 primary  
3. 系统字体 + CSS-only 动效  
4. 空状态 = 排版 + 轻量几何  
5. MVP = 全站视觉（含 loading/skeleton 与窄屏视觉打磨）；不含主题编辑器、不含营销落地页、不含新 UI kit  

**Consequences**: 品牌从蓝工具转为黑白产品；workbench 须在留白与信息密度间平衡；e2e 可能需跟 class。

## Out of Scope

- 新功能 / 新路由 / core 或 API 变更
- 引入 Tailwind / shadcn / 其他 UI kit
- 网页字体文件、动效库、插画资产体系
- 主题定制器、营销站、非 `packages/web` 表面
- 业务文案重写 / i18n

## Technical Notes

- 主文件：`packages/web/src/styles.css`、`app/app.tsx`、`app/theme.tsx`、`components/controls.tsx`、`features/**`
- Spec：`.trellis/spec/frontend/local-session-app-foundation.md`、`source-management-foundation.md`、`skills-workbench-foundation.md`、`component-guidelines.md`、`quality-guidelines.md`
- 现状：无 UI 库；React 19 + Vite；theme 经 `data-theme` + `skillpin.theme` storage
