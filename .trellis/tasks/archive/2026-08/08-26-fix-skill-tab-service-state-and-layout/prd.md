# 修复技能页数据、服务状态与布局

## Goal

修复技能源添加并扫描成功后，技能页无法读取已扫描技能、服务仍在运行却显示不可用，以及技能工作台布局偏离产品方案 6.4 三栏设计的问题。

## What I already know

- 添加技能源后，扫描结果已包含技能。
- 切换到“技能” tab 后，页面无法读取已扫描技能。
- 服务实际运行时，技能页面仍报“无服务”。
- 页面布局未按设计实现。
- 布局真源：`/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin产品技术一体化方案.md` §6.4 三栏技能工作台。
- 生产静态服务只响应 `GET /`、`/favicon.svg`、`/assets/*`。`GET /skills` 与 `GET /sources` 返回空 404。Vite 开发服务器有 SPA fallback，E2E 测不到该缺陷。
- 技能工作台被包在 `main { width: min(100%, 1040px) }` 里，三栏网格无法铺满工作区；外层还有重复标题。
- 文案无字面“无服务”。最接近：`无法连接本地 SkillPin 服务。`、`无法连接至 SkillPin`、错误边界“SkillPin 需要重新启动”，以及空白 404。
- Catalog 与 Source 共用会话内 `CatalogIndex`。源扫描成功后 `GET /api/catalog` 集成测试可读候选。问题更可能在浏览器路由 / 工作台渲染。

## Requirements

1. **技能可读**
   - 添加技能源且扫描成功后，切换到技能 tab 必须展示已扫描分组 / 候选，并能打开只读详情。
   - 源变更后刷新当前 catalog，不清除会话凭据。

2. **服务状态正确**
   - `GET /skills`、`GET /sources`、`GET /onboarding` 回退到同一份 SPA `index.html`。
   - bootstrap cookie 仍只在 `GET /` 发放。
   - 服务存活时技能页不得表现为空白 404 或“无服务 / 无法连接”。
   - catalog 加载失败显示真实错误，不得把可达服务误报成不可用。
   - encoded traversal、非 GET/HEAD、Host/Origin 校验行为保持不变。

3. **布局对齐产品方案 6.4**
   - 桌面三栏工作台铺满侧栏右侧：
     - 左：来源与状态筛选
     - 中：搜索 + 技能分组列表
     - 右：技能详情（说明 / 来源 / 路径 / SKILL.md）
   - 底部保留待应用变更条（已有 P9 能力，布局位置对齐）。
   - 去掉 `main` 的 1040px 居中限制；技能页不重复套一层与壳层冲突的大标题区。
   - 窄屏：左栏收为筛选抽屉、右栏收为详情抽屉；核心应用操作保持可见（方案 6.9）。
   - 不引入新 UI 库；继续 `styles.css` + 现有 controls。

## Acceptance Criteria

- [ ] 集成测试：带静态根的会话中，`GET /skills` 与 `GET /sources` 返回 SPA HTML，且不发放 bootstrap cookie。
- [ ] 集成或 E2E：添加并扫描技能源后，打开 `/skills` 能读到该源候选及详情。
- [ ] 服务存活时，技能页不出现空白 404，也不把可达服务显示为“无法连接本地 SkillPin 服务”。
- [ ] 桌面宽度下技能工作台为三栏铺满工作区；结构对应 6.4（筛选 | 列表 | 详情）。
- [ ] 窄屏下筛选/详情可收起为抽屉或纵向折叠，主操作仍可见。
- [ ] lint、类型检查、相关测试通过。

## Definition of Done

- 测试新增或更新。
- lint、typecheck、相关测试通过。
- 行为变更写入任务材料；SPA fallback 合同缺口回写 P11；布局合同对齐 skills-workbench-foundation。

## Technical Approach

1. **SPA fallback（服务“无服务”根因）**  
   `LocalHttpServer`：非 `/api/` 的应用路径在静态根存在时回退 `index.html`；cookie 仍仅 `GET /`。

2. **技能可读**  
   确认 fallback 后 catalog 请求可达；必要时补强 CatalogProvider 在源变更 / 首次进入时的加载与错误展示。

3. **布局**  
   `styles.css` + `app.tsx` + `skills-workbench-page.tsx`：工作区铺满、三栏对齐 6.4、去重复标题、窄屏抽屉/折叠。

## Decision (ADR-lite)

**Context**: 仓库无 `.pen`；用户提供产品技术一体化方案作为布局真源。  
**Decision**: 布局验收以方案 §6.4 / §6.9 为准；“无服务”优先修生产 SPA fallback。  
**Consequences**: 不像素级还原未知稿；P8 现有“候选比较中栏”需向 6.4 的“筛选 | 列表 | 详情”靠拢，保留 P9 暂存/应用能力。

## Out of Scope

- 重写技能源或服务生命周期架构。
- 未关联页面的全面视觉重构、新设计系统、新依赖。
- 方案 15.1 演进能力（多项目台、文件监听、桌面壳等）。
- 后端 API 路径从 `/api/catalog` 改名为方案草案中的 `/api/skills`（已落地契约优先）。

## Technical Notes

- 设计真源：`SkillPin产品技术一体化方案.md` §6.4–6.9、§5.4–5.7。
- 静态 404：`packages/cli/src/server/http-server.ts`、`static-assets.ts`。
- 工作台：`packages/web/src/features/catalog/`、`app/app.tsx`、`styles.css`。
- 合同：`p11-build-install-delivery-contract.md`、`skills-workbench-foundation.md`、`catalog-workbench-api-contract.md`。
- E2E 用 Vite dev，必须加集成测试覆盖生产静态 fallback。
