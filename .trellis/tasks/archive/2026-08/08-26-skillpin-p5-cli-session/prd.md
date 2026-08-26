# 实现 SkillPin P5：CLI、本地 HTTP/WebSocket 与会话安全

## Goal

实现可分发 `skillpin` 命令的 P5 后端运行时：将一个规范化的目标项目固定到受保护的本地会话中，提供仅回环可访问的静态 Web/JSON API/WebSocket 服务，并在重复启动、浏览器断连、显式关闭和进程信号下安全地管理生命周期。该 API 契约将作为 P6–P9 Web 开发的稳定边界。

## What I already know

- 用户要求按 `SkillPin实施计划.md` 完成 P5–P11；本任务先执行其中的 P5，后续阶段将在 P5 验收后继续创建并实施。
- 已完成 P0–P4：npm workspace、跨平台链接、配置/清单持久化、来源扫描、项目快照、变更规划、事务、进程内项目锁和幂等请求缓存均已存在。
- P4 已提供 Node-only 的项目应用编排边界，P5 必须调用该边界，而不能让 HTTP 层直接操作链接事务。
- CLI 当前是最小版本信息入口；Web 当前是空应用壳。P5 需要保持 `@skillpin/core` 包根的浏览器安全。
- 权威需求：`/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin实施计划.md` P5；配套设计文档 §§4.7、5.2、5.8、7.4、8.1–8.3、9.1–9.3、10.1、11、12.4。

## Requirements

1. 命令行支持 `skillpin [target]`、`--target`、`--no-open`、`--port`、`--help`、`--version`，并以稳定、可测试的解析错误返回无效输入。
2. 启动时将目标路径规范化为固定真实项目路径；默认目标为当前目录。拒绝无效目录或不安全/不支持的目标状态。
3. 实现会话注册表：按固定项目真实路径的不可逆摘要识别会话；同一项目的第二次启动复用已有会话并返回其地址，不同项目可并行。
4. 服务仅监听 loopback。无显式端口时使用随机可用 loopback 端口；显式端口冲突返回稳定失败；不得监听 `0.0.0.0` 或局域网地址。
5. 提供静态 Web 资源、健康/会话 bootstrap JSON API，以及可扩展的 P6–P9 路由注册边界；API 契约类型放在浏览器安全的 `@skillpin/core` 根导出中。
6. 每次浏览器会话使用一次性引导令牌交换短生命周期会话凭据；所有 API 和 WebSocket 写/读入口都校验凭据、Host、Origin 和回环请求边界，默认不发送 CORS 头。
7. WebSocket 按会话认证，提供客户端计数、心跳、严格单调递增事件序号以及可用于后续页面刷新和状态更新的事件广播。
8. 最后一个 WebSocket 页面断开后进入 60 秒待退出期；有效重连取消倒计时。支持显式关闭及 `SIGINT`/`SIGTERM` 优雅关闭，不中断正在进行的 P4 变更事务。
9. 默认尝试打开系统浏览器；失败时仍打印可用会话 URL。`--no-open` 禁止打开浏览器。
10. 不记录引导令牌、会话凭据、WebSocket 查询令牌或技能 Markdown 正文到终端/调试日志。

## Acceptance Criteria

- [x] `skillpin --help`、`skillpin --version`、目标/端口/打开浏览器选项均有覆盖测试。
- [x] CLI 服务能固定目标项目、启动 loopback HTTP 服务、输出可访问地址且可在禁用浏览器时正常工作。
- [x] 同一真实项目的重复启动复用同一会话；不同项目可同时拥有独立会话。
- [x] 非 loopback Host、错误 Origin、缺失/错误/已消费 bootstrap token、缺失/错误会话凭据均不能调用 API 或 WebSocket；响应不开放 CORS。
- [x] WebSocket 有认证、心跳、连接计数和严格递增事件序号。
- [x] 最后页面断开后等待 60 秒才退出，重连会取消退出；显式关闭和终止信号能优雅清理服务。
- [x] 进行中的 P4 项目变更事务不会因请求的会话终止而被强行中断。
- [x] `npm run lint`、`npm run typecheck`、`npm test`、`npm run format:check` 通过；新增 P5 单元/集成测试覆盖会话生命周期与本地 API 安全。

## Out of Scope

- P6 及以后真实 React UI、主题、来源管理、目录浏览、技能工作台、变更预览 UI 与打包交付。
- P5 之外的远程访问、多用户认证、TLS、局域网共享、跨进程会话注册或持久化会话凭据。
- 改变 P1–P4 的链接策略、事务语义、跨进程锁范围或扫描算法。

## Technical Approach

- 在 `packages/cli/src/` 中按 `command`、`session`、`server`、`security`、`browser` 切分依赖方向；HTTP 路由只依赖 API contracts 和 P4 服务边界。
- 使用 Node 内建 `http`、`crypto`、`path`、`fs` 实现安全的最小依赖服务；若现有依赖已提供 WebSocket，则复用，否则添加一个维护良好的明确依赖并锁定版本。
- 使用不可预测令牌、常量时间比较、单次消费 bootstrap、受限 Host/Origin 策略，且不通过 URL 日志泄露秘密。
- 将会话实际退出建模为生命周期状态机；会话关闭首先停止接收新连接/请求，再等待活动变更操作安全结束，最后关闭 WebSocket/HTTP 服务并从注册表移除。
- 保持 `@skillpin/core` Node-only P4 exports 仅位于其 Node entrypoint；共享 API contracts 无 Node 运行时导入。

## Definition of Done

- P5 所有 Acceptance Criteria 有与其范围匹配的自动化证据。
- 质量门通过，审查发现的问题已修复。
- 如发现可复用且尚未记录的项目约定，更新 Trellis specs。
- P5 代码以独立逻辑提交；之后继续 P6。
