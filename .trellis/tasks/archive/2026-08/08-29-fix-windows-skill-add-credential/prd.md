# 修复 Windows 添加技能源凭证校验失败

## Goal

修复 Windows 安装包启动的 SkillPin 在添加技能源时返回 `A valid SkillPin session credential is required.` 的问题，使有效的本地会话能稳定完成路径验证和技能源保存。

## What I already know

- 问题仅报告于 Windows：安装成功后启动 SkillPin，输入绝对路径添加技能源时失败。
- 失败信息来自本地 HTTP 服务的认证拦截器，而非路径验证或技能源扫描：`SESSION_CREDENTIAL_INVALID` / `A valid SkillPin session credential is required.`
- Web 客户端在 `LocalApiClient.bootstrap()` 中将会话凭证保存在内存，并为后续 API 请求添加 `Authorization: Bearer <credential>`。
- 本地服务将会话凭证的有效期固定为 10 分钟；WebSocket 连接可持续存在，但当前客户端没有在凭证过期时刷新会话凭证。
- 添加技能源会先调用受保护的路径验证 API，再调用受保护的创建 API；两者都会在凭证失效时返回该错误。
- 相关实现位于 `packages/web/src/api/local-api.ts`、`packages/web/src/features/session/session-context.tsx`、`packages/cli/src/session/session-manager.ts` 和 `packages/cli/src/server/http-server.ts`。

## Assumptions (temporary)

- 用户已确认：应用启动后立即添加即复现，因此 10 分钟凭证过期不是此次问题的直接触发条件。需要定位首次受保护请求所携带凭证与服务端会话不一致的原因。
- 修复应保留当前的本地回环、同源、一次性 bootstrap token 与短期凭证安全边界，而非放宽认证校验。

## Open Questions

- 已确认：启动后首次点击“验证路径”即报错；路径验证请求是首次暴露该问题的受保护 API 调用。

## Requirements

- 在 bootstrap 成功后，将同一短期会话凭证写入仅限同源的 HttpOnly 会话 cookie。
- 本地 API 同时接受现有 Bearer 凭证和受保护的会话 cookie；客户端保持 Bearer 发送方式，以兼容现有协议和 WebSocket。
- 让浏览器请求即使未携带或被 Windows 浏览器环境异常处理 `Authorization` 标头，仍能通过同源 HttpOnly cookie 完成认证。
- 在会话关闭时清理浏览器侧会话 cookie；服务端仍清空内存凭证。
- 不得将会话凭证写入 URL、持久化存储或错误文本。
- 不得削弱回环地址、Host、Origin / `Sec-Fetch-Site`、bootstrap token 或 Authorization 校验。


## Acceptance Criteria

- [x] Bootstrap 成功后，响应会设置短期 HttpOnly、SameSite=Strict 的本地会话 cookie，并清除已消费的 bootstrap cookie。
- [x] 同源、回环的受保护 API 请求仅携带有效会话 cookie 时可成功；无效或过期 cookie 仍返回 401。
- [x] 现有 Bearer 凭证认证和 WebSocket 协议认证保持可用。
- [ ] Windows 打包后的应用可以使用绝对路径验证并添加技能源。（待 Windows 原生安装包人工验证；本次已通过打包冒烟、浏览器 E2E 和真实回环路径验证覆盖。）
- [x] 添加覆盖 cookie 回退认证和 cookie 清除的自动化测试。

## Definition of Done (team quality bar)

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope (explicit)

- 改变技能源目录扫描规则或支持非绝对路径。
- 放宽本地 API 的认证或同源安全策略。
- 重新设计整个会话协议。

## Technical Approach

在 bootstrap 成功响应中设置 `skillpin_session` HttpOnly cookie（`Path=/`、`SameSite=Strict`、与现有凭证相同的短期有效期）。服务端认证改为“有效 Bearer **或** 有效会话 cookie”；受保护 API 仍先执行现有回环 / Host / Origin 防护。客户端继续保留内存 Bearer 凭证和 WebSocket 子协议，因而不会改变现有调用方式；cookie 只作为浏览器环境出现 Authorization 传递异常时的安全回退。会话关闭响应会清理 cookie。

## Decision (ADR-lite)

**Context**: Windows 在全新启动后首次路径验证即被服务端以 `SESSION_CREDENTIAL_INVALID` 拒绝，排除凭证自然过期与路径校验逻辑。当前 REST API 只能依赖 JavaScript 添加的 Authorization 标头，而 bootstrap 已经能够安全地建立同源 HttpOnly cookie 通道。

**Decision**: 增加短期 HttpOnly 会话 credential cookie，并将其作为 Bearer 的等价认证回退。

**Consequences**: 保持协议向后兼容，避免放宽认证；需要增加 cookie 生命周期和认证回退测试。服务端仍只信任内存中未过期的凭证，因此重启后残留 cookie 不会被接受。

## Technical Notes

- `packages/cli/src/security/session-token.ts`: `SESSION_CREDENTIAL_TTL_MS = 10 * 60 * 1000`.
- `packages/web/src/features/session/session-context.tsx`: bootstrap only runs once per page lifecycle; the existing WebSocket reconnect loop reuses its initial credential.
- User confirmation (2026-08-29): the failure occurs immediately on the first “Validate path” click, so this is not solely credential expiry.
- `packages/web/src/api/local-api.ts`: each protected request sends the in-memory bearer credential and exposes structured API errors.
- `packages/cli/src/server/http-server.ts`: all non-bootstrap APIs require a valid Bearer or the same short-lived HttpOnly session credential cookie; the bootstrap token is issued by `GET /` and consumed once by `POST /api/session/bootstrap`.

## Verification Evidence

- 2026-08-29: `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` passed (91 tests).
- 2026-08-29: focused `tests/integration/local-api-security.test.ts` passed (8 tests), including cookie-only `POST /api/sources/validate`, invalid-cookie rejection, retained Bearer auth, and shutdown cookie clearing.
- 2026-08-29: `npm run build`, `npm run pack`, `npm run verify-package`, `npm run test:package`, and `npm run test:e2e` passed. The remaining Windows installed-app validation requires a native Windows host.
