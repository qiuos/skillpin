# 发布新版本

## Goal

将包含界面可读性与工作台布局优化的当前 `main` 分支作为正式 GitHub Release 发布，并交付可安装的私有 npm 包归档。

## What I already know

* 当前根包版本为 `0.1.7`，最近正式发布标签为 `v0.1.7`。
* 用户要求发布新版本，未指定版本号；项目发布规范规定默认递增 patch 版本，因此目标版本为 `0.1.8`。
* 当前 `main` 包含已提交的界面优化提交 `1347865`，工作区干净，但本地分支比 `origin/main` 领先 3 个提交。
* 发布流程通过 `npm version patch` 更新 `package.json` / `package-lock.json`、创建版本提交和带注释的 `v0.1.8` 标签。
* 推送 `main` 和标签会触发 GitHub Actions Release 工作流，工作流构建、校验、打包、执行隔离安装烟雾测试，并创建 GitHub Release、上传 `artifacts/skillpin-0.1.8.tgz`。
* 仓库明确不会发布到公共 npm registry；本地 npm 当前也未登录，且该发布流程不需要 npm publish。
* GitHub CLI 已使用具备仓库和 workflow 权限的 `qiuos` 账户登录，仓库为 `qiuos/skillpin`。

## Requirements

* 以稳定 SemVer `0.1.8` 发布本次变更。
* 在版本提交上完成发布前的 format、lint、typecheck、unit、build、pack、包内容校验和包安装烟雾测试。
* 推送版本提交与标签至 `origin/main`，触发 GitHub Release 工作流。
* 确认 GitHub Release 标题/标签为 `v0.1.8`，且附带唯一资产 `skillpin-0.1.8.tgz`。
* 不向公共 npm registry 发布任何包。

## Acceptance Criteria

* [x] 根 `package.json` 与锁文件版本均为 `0.1.8`。
* [x] 存在指向版本提交的带注释标签 `v0.1.8`。
* [x] 所有发布前校验通过，且仅生成 `artifacts/skillpin-0.1.8.tgz`。
* [x] 版本提交与标签均已推送至 `origin`。
* [x] GitHub Release 工作流成功，Release 附件名为 `skillpin-0.1.8.tgz`。
* [x] 未执行 `npm publish`。

## Local Validation

已在版本提交 `6620d34`（`0.1.8`）上完成下列校验，全部通过：

* `npm ci`
* `npm run format:check`
* `npm run lint`
* `npm run typecheck`
* `npm test`（16 个测试文件、86 项测试通过）
* `npm run build`
* `npm run pack`
* `npm run verify-package`
* `npm run test:package`

验证产物目录仅包含 `artifacts/skillpin-0.1.8.tgz`。本地流程未执行 `npm publish`。

## Release Verification

* 已推送 `main` 与带注释标签 `v0.1.8`；远程 `main` 和标签剥离后的提交均为 `6620d347ea34002da12931c6bafa56074fd75b3d`。
* GitHub Actions **Release** 工作流 `33046454713` 于 2026-08-27 成功完成，重新执行了全部构建、包校验与隔离安装烟雾测试。
* GitHub Release `v0.1.8` 已发布（标题 `SkillPin v0.1.8`），唯一附件为 `skillpin-0.1.8.tgz`，大小 190,232 bytes，SHA-256 为 `d00dec6e3f16f7ccf39bfe54bd77719363636a7866d5b2a15b54ce7b873d6c77`。
* 已按 `trellis-update-spec` 评估：本任务只执行既有的版本化与发布流程，未形成新的代码接口、跨层约定或可复用实现经验；不更新 `.trellis/spec/`。

## Definition of Done

* 发布资产已在 GitHub Release 中可用。
* 发布版本、标签与包元数据一致。
* 发布流程和会话记录已归档。

## Out of Scope

* 不发布预发布版本或公共 npm 包。
* 不在本任务中追加任何产品功能。

## Technical Notes

* 发布规范：`docs/releasing.md`。
* 自动发布工作流：`.github/workflows/release.yml`。
* 发布前校验由 `npm run pack`、`npm run verify-package` 和 `npm run test:package` 覆盖。

## Decision (ADR-lite)

**Context**: 用户已确认发布，但未指定目标版本；仓库正式发布流程使用稳定 SemVer、Git 标签与 GitHub Release 资产。

**Decision**: 采用默认 patch 递增，发布 `0.1.8`；只通过 GitHub Release 工作流交付私有安装包，不执行 `npm publish`。

**Consequences**: 将创建版本提交和 `v0.1.8` 标签并推送至远程；该外部操作会触发一次 GitHub Actions 发布工作流。

## Implementation Plan

1. 通过 `npm version patch` 创建 `0.1.8` 版本提交与标签。
2. 在版本提交上运行完整发布验证与本地包验证。
3. 推送 `main` 及标签，等待并核验 GitHub Release 工作流和发布资产。

## Approval

用户于 2026-08-27 确认发布 `0.1.8`、推送标签和触发 GitHub Release。
