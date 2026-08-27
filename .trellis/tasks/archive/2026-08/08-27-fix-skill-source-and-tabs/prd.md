# 修复技能源配置与顶部导航展示

## Goal

修复已存在的技能源被 UI 误判为“尚未添加”时仍显示首次配置引导的问题，并恢复稳定可见的顶部“技能 / 技能源”导航；同时移除顶部“外观”入口及其主题选择抽屉，保留现有主题外观。

## What I already know

- 用户在 macOS 上已验证目录 `/Users/healer/Documents/02-skills/P0-我的/skills`，随后再次添加时服务端明确返回：`This directory is already configured as a skill source.`
- 现有前端以 `sources.length > 0` 同时决定：是否显示顶部导航、是否显示首次配置引导、以及当前工作区的页面内容（`packages/web/src/app/app.tsx`）。因此，来源加载失败时初始空数组会被错误解释为“确实没有技能源”。
- `SourceProvider` 的 `refresh()` 在 `GET /api/sources` 失败后只记录错误，仍把 `isLoading` 设为 `false`，并保留初始空数组（`packages/web/src/features/sources/source-context.tsx`）。这会触发上述错误的首次配置状态。
- 顶部“外观”按钮及抽屉由 `app.tsx` 中的 `showAppearance`、`useThemePreference`、`ThemePicker`、`Drawer` 等逻辑实现；主题状态由 `packages/web/src/app/theme.tsx` 写入 `document.documentElement.dataset.theme`。
- 当前端到端测试覆盖了添加来源、已有来源显示、顶部导航和外观抽屉，但未覆盖“来源列表读取失败时不进入首次配置引导”的回归场景（`tests/e2e/app.spec.ts`）。

## Requirements

- 已成功配置的技能源必须在页面初始化、网络短暂失败或本地会话重连期间不被 UI 误判为“没有技能源”。
- 仅当已成功加载技能源列表且列表为空时，才展示“设置你的第一个技能源”引导并跳转到 `/onboarding`。
- 技能源列表获取失败时，保留明确的加载/错误状态并允许后续恢复，不得用首次配置引导掩盖该错误。
- 顶部“技能”和“技能源”标签在已知存在技能源时稳定显示；恢复成功后可正常切换两页。
- 移除顶部“外观”按钮、外观抽屉和主题选择逻辑；保留当前 CSS 主题表现，不引入新的主题控制入口。
- 更新相关自动化测试，覆盖上述首次配置误判回归，并删除/替换依赖“外观”按钮的测试断言。

## Acceptance Criteria

- [x] 当 `/api/sources` 返回错误时，页面不显示“设置你的第一个技能源”，也不会强制把 `/skills` 或 `/sources` 跳转到 `/onboarding`。
- [x] 当来源请求之后成功返回至少一个来源时，顶部“技能”“技能源”导航出现，且可在 `/skills` 与 `/sources` 间切换。
- [x] 当来源请求成功返回空列表时，仍展示首次配置引导。
- [x] 顶部不存在“外观”按钮或外观抽屉，应用仍按现有默认主题渲染。
- [x] 前端类型检查、lint、单元测试与受影响的 Playwright E2E 测试通过。

## Definition of Done

- Tests added/updated for the changed behavior.
- Lint / typecheck / relevant tests pass.
- Specs/notes updated if a durable convention emerges.
- No session credentials or source filesystem contents are exposed.

## Technical Approach

Introduce an explicit “source list has completed a successful load” state in `SourceProvider`, and have `AppShell` gate onboarding navigation/rendering on that state rather than treating the initial/error empty array as authoritative. Ensure source-list refresh retries when the local session becomes usable again. Simplify the application shell by removing the appearance drawer state, imports, and theme controls; retain existing visual CSS tokens.

## Decision (ADR-lite)

**Context:** An empty client-side list has two meanings today: the server successfully reported zero configured sources, or the client failed before obtaining the list.

**Decision:** Model successful source-list resolution separately from the list contents and use it as the authority for setup routing/UI decisions.

**Consequences:** Source errors stay visible and recoverable rather than redirecting users to a misleading setup form. Existing source-based navigation remains conditional on confirmed source data.

## Out of Scope

- Changing persisted source configuration, duplicate-path rules, or scanner behavior.
- Altering the existing visual design tokens beyond removing the theme-control UI.
- Adding a new settings page or theme-selection mechanism.

## Technical Notes

- Likely files: `packages/web/src/features/sources/source-context.tsx`, `packages/web/src/app/app.tsx`, `packages/web/src/app/theme.tsx` (potential deletion), `tests/e2e/app.spec.ts`; CSS cleanup only if unused appearance selectors remain.
- Backend/API contracts already treat source configuration as session-owned and server-authoritative; no backend behavior change is expected.
