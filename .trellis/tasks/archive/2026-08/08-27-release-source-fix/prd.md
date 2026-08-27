# 发布包含技能源修复的新版本

## Goal

将已合入 `main` 的技能源首次配置状态修复与顶部导航调整，以正式 GitHub Release 交付。当前版本为 `0.1.5`，按项目发布约定拟发布稳定补丁版本 `0.1.6`。

## What I already know

- 用户要求发布新版本，发布内容是上一任务已完成的技能源修复和顶部 UI 调整。
- 相关工作已在 `main`：`7c7aa72 fix(web): correct source onboarding state`；其后任务归档与日志提交也已完成。
- 当前根包版本与最新 Git tag / GitHub Release 都是 `0.1.5`。
- `docs/releasing.md` 规定：正式交付使用 GitHub Release，不发布到公共 npm；默认增加 patch 版本，并使用 `npm version patch` 创建版本提交与匹配的 `v<version>` 注释标签。
- `.github/workflows/release.yml` 会在 `v*` 标签推送后执行构建、格式、lint、类型检查、测试、打包、包验证和隔离安装冒烟测试；成功后上传 `artifacts/skillpin-<version>.tgz` 到 GitHub Release。
- GitHub CLI 当前已登录 `qiuos`，可查看现有 Release；npm 未登录，这符合本任务不向公共 npm 发布的约束。

## Assumptions (temporary)

- 未指定版本号时按项目文档发布 patch 版本 `0.1.6`。
- 本次发布不包含新的功能开发或额外代码改动，只包含已经提交在 `main` 的修复。

## Open Questions

- [x] 用户已于 2026-08-27 确认执行 `0.1.6` 的版本提交、质量验证，以及推送 `main` 和 `v0.1.6` 标签以触发 GitHub Release。

## Requirements

- 将根包与 lockfile 版本从 `0.1.5` 更新为 `0.1.6`，且标签必须为 `v0.1.6`。
- 在版本提交上完成发布文档规定的本地质量检查。
- 仅推送到 GitHub 并由 Release workflow 创建 / 更新 GitHub Release；不得向公共 npm registry 发布。
- 发布后确认 GitHub Release 名称、标签和唯一资产 `skillpin-0.1.6.tgz`。

## Acceptance Criteria

- [x] `package.json` 与 `package-lock.json` 的版本均为 `0.1.6`。
- [x] 存在版本提交 `ded6fca` 和匹配的注释标签 `v0.1.6`。
- [x] `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npm run pack`、`npm run verify-package`、`npm run test:package` 均通过。
- [x] `main` 与 `v0.1.6` 已推送到 `origin`，GitHub Actions Release workflow（run `33042594691`）成功。
- [x] GitHub Release `v0.1.6` 含唯一资产 `skillpin-0.1.6.tgz`（189,726 bytes，SHA-256 `f765d0d00acd46703cd0c7964a4a722347ea0142e4ae03d54fc557bf7c7885b3`），且没有公共 npm 发布。

## Definition of Done (team quality bar)

- 发布验证命令全部通过。
- GitHub Release 资产已确认。
- 发布过程和任何必要的项目知识已记录。

## Out of Scope (explicit)

- 不修改功能实现或 UI。
- 不向公共 npm registry 发布。
- 不创建预发布版本或移动 / 重用已有发布标签。

## Technical Notes

- 发布说明：`docs/releasing.md`
- 自动发布工作流：`.github/workflows/release.yml`
- 版本清单：`package.json`、`package-lock.json`
- 已验证发布内容的核心工作提交：`7c7aa72`。
- 安全边界：`npm whoami` 返回未登录；本项目发布流程不依赖 npm publish。
- 交付结果：GitHub Release `v0.1.6` 于 2026-08-27 05:29:22 UTC 发布，唯一资产已上传。
- 回滚：若本地检查失败，在推送前修复后重新创建一个新版本；若 GitHub Release 上传暂时失败，按文档重新运行同一 Release workflow，禁止移动既有 tag。
