# 发布 SkillPin 0.1.11

## Goal

将当前 `main` 中已完成的技能页默认路由与大字号布局修复作为正式 GitHub Release 发布，并提供可安装的私有 npm 包归档。

## What I already know

* 用户于 2026-08-27 明确要求“发布新版本”。
* 当前根包版本与最新正式标签均为 `0.1.10`；根据既有发布约定，未指定版本号时递增 patch，因此目标为稳定 SemVer `0.1.11`。
* 待发布功能已提交在 `7dadbbc`（`fix: default to skills and stabilize large type layout`），当前工作树干净。
* `.github/workflows/release.yml` 会在推送 `v*` 标签时验证标签与根包版本一致，运行格式化、静态检查、单测、打包、包校验和安装烟雾测试，然后创建 GitHub Release 并上传 `artifacts/skillpin-0.1.11.tgz`。
* 本地 npm 未登录，且本仓库既有发布流程只交付 GitHub Release 资产；不执行 `npm publish`。
* GitHub CLI 已以具备 `repo` / `workflow` 权限的 `qiuos` 账户登录，远程仓库是 `qiuos/skillpin`。

## Requirements

* 将根包版本与锁文件提升为 `0.1.11`。
* 建立版本提交和带注释的 `v0.1.11` 标签。
* 在版本提交上执行完整发布前验证与本地包验证。
* 推送 `main` 和 `v0.1.11` 至 `origin`，触发 GitHub Release 工作流。
* 验证 GitHub Release 已发布并含唯一资产 `skillpin-0.1.11.tgz`。
* 不发布到公共 npm registry。

## Acceptance Criteria

* [x] 根 `package.json` 与 `package-lock.json` 的版本均为 `0.1.11`。
* [x] 存在指向版本提交的带注释标签 `v0.1.11`。
* [x] 发布前格式化、静态检查、单测、构建、打包、包内容校验和安装烟雾测试全部通过。
* [x] 版本提交和标签均已推送至 `origin`。
* [x] GitHub Release 工作流成功，Release 唯一附件为 `skillpin-0.1.11.tgz`。
* [x] 未执行 `npm publish`。

## Definition of Done

* 发布资产可从 GitHub Release 下载。
* 版本号、标签和发布资产一致。
* 发布任务与会话日志已归档。

## Out of Scope

* 不新增产品功能。
* 不发布预发布版本或公共 npm 包。

## Technical Notes

* 发布规范：`docs/releasing.md`。
* 自动发布：`.github/workflows/release.yml`。
* 相关本地校验：`npm run format:check`、`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npm run pack`、`npm run verify-package`、`npm run test:package`。

## Decision (ADR-lite)

**Context**：用户确认发布但未指定版本号；项目采用稳定 SemVer、Git 标签和 GitHub Release 资产交付。

**Decision**：按既有约定发布默认 patch 版本 `0.1.11`，仅通过 GitHub Release 工作流提供私有安装包，不执行 `npm publish`。

**Consequences**：将创建版本提交和 `v0.1.11` 标签并推送远程，进而触发一次 GitHub Actions 发布工作流。

## Implementation Plan

1. 用 `npm version patch` 创建 `0.1.11` 版本提交与带注释标签。
2. 在版本提交上运行完整发布验证和本地包验证。
3. 推送 `main` 与标签，等待并核验 GitHub Release 工作流和发布资产。

## Approval

用户于 2026-08-27 确认发布新版本；本 PRD 将该请求解析为默认 patch 发布 `0.1.11`、推送标签并触发 GitHub Release。

## Local Validation

已在版本提交 `437549b`（`0.1.11`）完成下列校验，全部通过：

* `npm ci`
* `npm run format:check`
* `npm run lint`
* `npm run typecheck`
* `npm test`（16 个测试文件、86 项测试通过）
* `npm run build`
* `npm run pack`
* `npm run verify-package`
* `npm run test:package`

本地 `artifacts/` 仅生成 `skillpin-0.1.11.tgz`（189,458 bytes，SHA-256：`62a7f932033d10f9367a958447e058cfcac37de3b5a97656220fce27dade38da`）。本地流程未执行 `npm publish`。

## Release Verification

* 已通过 SSH 推送将 `main` 与带注释标签 `v0.1.11` 推送到 `origin`；远程 `main` 与标签剥离后的提交均为 `437549b8cc5a0fa57cf1a3578f9a8fa0339d3360`。
* GitHub Actions **Release** 工作流 `33052726232` 于 2026-08-27 成功完成，重新执行全部发布校验。
* GitHub Release `v0.1.11` 已发布（标题 `SkillPin v0.1.11`），唯一附件为 `skillpin-0.1.11.tgz`，大小 190,004 bytes，SHA-256：`17d462f646f3cfd57e4cbb87e45d2568c264cfd60fd6cfe5eaaf1518ec7b1d37`。
* 已按 `trellis-update-spec` 评估：本任务沿用既有版本化与 GitHub Release 流程，未形成新的代码接口、跨层约定或可复用实现经验；不更新 `.trellis/spec/`。
