# 实现 SkillPin P6：Web 应用基础、设计系统与会话壳

## Goal

将 P5 的受保护本地会话契约接入 React Web 应用，建立面向开发者工具的可访问设计系统、主题、应用壳、基础路由、会话凭据/API 客户端和 WebSocket 连接状态。P6 只交付 UI 基础与稳定跨层边界；来源管理、技能工作台和真实变更流程由 P7–P9 接续实现。

## What I already know

- 用户要求按实施计划继续完成 P5–P11；P5 已完成、验证并提交，提供 loopback-only API、一次性 bootstrap cookie、短期 bearer credential、`GET /api/session`、`POST /api/session/shutdown`、认证 WebSocket `/api/session/events` 及浏览器安全 API contracts。
- P5 建立了 `@skillpin/core` 根导出的 `LOCAL_API_VERSION`、`BootstrapSessionResponse`、`LocalSessionInfo`、`LocalApiResponse` 和 `LocalSessionEvent`；Web 必须只使用这些浏览器安全契约，绝不导入 CLI 源码或 Node-only core subpaths。
- P6 实施计划要求中性灰背景、蓝紫主色、克制语义色、系统字体配合路径等宽字体、细边框/轻阴影/适度圆角，明确禁止大面积渐变、玻璃拟态和装饰动画。
- 当前 `packages/web` 仍是 P0 空壳。P5 当前提供的是最小静态 fallback shell；P11 将负责把最终 Web 构建资产复制进 CLI 分发包，因此 P6 不应通过 CLI 导入 Web 源码。
- 本任务触发本地 `awesome-design` 技能：在开始 UI 代码前，必须确认一个本地设计品牌规范。候选与最终风格选择将记录在本 PRD。

## Requirements

1. 建立 CSS 变量设计令牌：中性色、蓝紫主色、语义色、排版、圆角、阴影、间距、层级和交互状态。
2. 实现系统、浅色和深色主题；用户选择持久化，系统主题变化在使用 system 模式时生效。
3. 实现应用头部：SkillPin 标识、固定项目名称/完整路径、连接状态及“结束 SkillPin”入口。
4. 实现浏览器安全 API 客户端：从 P5 bootstrap 交换凭据、发送受认证 JSON 请求、将 API failure 转换为统一客户端错误、绝不存储/日志化凭据。
5. 实现认证 WebSocket 客户端、指数退避重连、连接中断和待退出提示；连接断开时暴露 read-only/写入禁用状态，但不清除未来 P7–P9 页面暂存选择。
6. 建立可复用基础组件：Button、TextInput、Checkbox、Radio、Badge、Dialog、Drawer、Tooltip、EmptyState，以及通知/错误呈现边界。
7. 建立键盘焦点、可见 focus ring、弹窗/抽屉焦点陷阱和关闭后焦点返回；所有状态用图标、文字和颜色共同表达。
8. 建立基础路由：`/onboarding`、`/skills`、`/sources`。不提供未经设计确认的仪表盘首页；会话加载完成后根据后续来源数据进入合适页面，P6 先保留明确的可测试路由壳。
9. 添加组件/API/session 测试，更新现有 Playwright 断言以验证非仪表盘会话壳的可访问入口。

## Acceptance Criteria

- [ ] 系统、浅色、深色主题可切换并持久化；所选品牌规范的色彩、排版、圆角、间距和组件语气得到落实。
- [ ] 应用头部始终显示 P5 固定项目路径、连接状态和可键盘访问的结束入口。
- [ ] API bootstrap/凭据和统一错误状态有覆盖测试；凭据不在 localStorage、URL、渲染文本或错误日志中出现。
- [ ] 认证 WebSocket 可连接、断连、重连并渲染连接/待退出状态；在断线期间写操作入口可由上下文禁用且本地暂存状态不会被重置。
- [ ] Button、输入、勾选、单选、徽标、弹窗、抽屉、提示和空状态具有一致主题和键盘/焦点行为。
- [ ] `/onboarding`、`/skills`、`/sources` 的基础路由存在，且无“dashboard”默认首页。
- [ ] `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:e2e`、`npm run format:check` 和构建通过。

## Out of Scope

- P7 的来源 CRUD、目录浏览、扫描进度/健康状态和首次来源真实业务流。
- P8 的技能搜索、三栏工作台、候选对比、安全 Markdown、路径复制和虚拟列表。
- P9 的真实计划/应用 API 路由、底部变更栏、变更审查与恢复 UI。
- P11 的 CLI 包内 Web 静态资源复制、安装/升级验证和最终分发白名单。

## Technical Approach

- 在 `packages/web/src/` 下采用 `app/`、`api/`、`components/`、`features/session/`、`styles/` 分层；跨 feature 公共控制件只在 `components/` 实现一次。
- 用 React context/reducer 管理会话连接状态和凭据的内存生命周期；浏览器端只从 P5 HTTP bootstrap 获取凭据，并在 WebSocket `Sec-WebSocket-Protocol` 中发送规定 token，绝不将其放入 query string。
- 使用标准 Web APIs 和 React；如新增依赖，必须具有明确的可访问性/安全收益并加入锁文件。先搜索现有工具，避免创建平行状态机制。
- P6 将在用户确认设计品牌后，读取对应 `DESIGN.md` 作为视觉实现的唯一风格依据。

## Design decision pending

- [ ] Final local design brand approved by user.
- Candidate recommendation: `linear.app` — dense, keyboard-friendly developer workflow with restrained hierarchy; adapt its energy to the product-mandated neutral-gray and blue-purple token palette without gradients/glass effects.

## Definition of Done

- P6 Acceptance Criteria 有适当层级的自动化证据。
- API/会话边界与 P5 contract 保持兼容；不将 Node-only runtime 引入 Web bundle。
- 通过质量门，必要时更新 frontend/backend code-spec，并以单独提交记录。
