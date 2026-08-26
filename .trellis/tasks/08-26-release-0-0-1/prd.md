# 发布 SkillPin 0.1.0 正式版本

## Goal

将 SkillPin 发布为 GitHub 正式版本，并由 Release 工作流生成并附加安装包 `skillpin-0.1.0.tgz`。

## What I already know

* 用户已确认发布版本 `0.1.0`。
* 当前根目录 `package.json` 的版本已是 `0.1.0`，因此无需变更包版本。
* 当前分支为 `main`，工作区干净；本地 `main` 比 `origin/main` 领先 13 个提交。
* 正式发布流程规定：版本号必须与 `v<version>` 标签一致；推送标签会触发 GitHub Actions 创建或更新 GitHub Release 并上传安装包。
* 该流程不发布到公共 npm registry。

## Assumptions (temporary)

* 将在当前版本提交上创建对应的带注释标签 `v0.1.0`，而不创建无实质版本修改的额外版本提交。

## Open Questions

* 无。

## Requirements (evolving)

* 使用已确认的稳定 SemVer 版本 `0.1.0`。
* 保持根 `package.json` 版本为 `0.1.0`，并在对应提交上创建带注释标签 `v0.1.0`。
* 运行发布前质量与打包检查。
* 推送当前 `main` 的待推送提交和标签至 GitHub。
* 确认 GitHub Release 包含与版本一致的 `.tgz` 安装包。

## Acceptance Criteria (evolving)

* [x] `package.json` 与 Git 标签的版本完全一致，且标签指向包含该包版本的 `main` 提交。
* [x] 发布检查成功：格式、lint、类型、测试、构建、打包、包验证、安装 smoke test。
* [x] GitHub 上存在 `v0.1.0` Release，并有 `skillpin-0.1.0.tgz` 资产。
* [x] 未发布至公共 npm registry。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 发布到公共 npm registry。
* 更改除版本发布所需内容之外的产品功能。

## Technical Notes

* 已检查：`docs/releasing.md`、根 `package.json`、Git 状态与远程配置。
* 发布流程要求从干净、最新的 `main` 开始；当前版本已匹配目标版本，所以采用带注释的 `v0.1.0` 标签，而非运行无版本变化的 `npm version`。

## Delivery Result

* `main`（提交 `9e7f0ca`）及带注释标签 `v0.1.0` 已推送至 `origin`。
* GitHub Actions Release 工作流 `32956099989` 于 2026-08-26 成功完成全部验证和 Release 创建步骤。
* GitHub Release `SkillPin v0.1.0` 已发布，资产为 `skillpin-0.1.0.tgz`（188,223 bytes，SHA-256 `199032239666c4ab8b901355aed46be76c298715d7aa2aea467897c0b88a4ecd`）。
* GitHub Actions 提示 `actions/checkout@v4` 和 `actions/setup-node@v4` 的 Node.js 20 runtime 弃用，但该次工作流被 GitHub 强制以 Node.js 24 执行并成功；这不阻塞本次发布。
