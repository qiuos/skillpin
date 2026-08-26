# 发布 SkillPin 0.1.1 正式版本

## Goal

将 SkillPin 发布为 GitHub 正式版本 `0.1.1`，并由 Release 工作流生成并附加安装包 `skillpin-0.1.1.tgz`。本次版本包含 Web UI 全面中文化、控件放大与界面现代化美化。

## What I already know

* 用户请求发布新版本，未指定版本号，按发布规范默认 patch 递增：`0.1.0` → `0.1.1`。
* 发布前已提交 UI 中文化与美化改动，以及 Prettier 格式化修复。
* 正式发布流程规定：版本号必须与 `v<version>` 标签一致；推送标签会触发 GitHub Actions 创建或更新 GitHub Release 并上传安装包。
* 该流程不发布到公共 npm registry。

## Requirements

* 使用稳定 SemVer 版本 `0.1.1`。
* 用 `npm version patch` 创建版本提交与带注释标签 `v0.1.1`。
* 运行发布前质量与打包检查。
* 推送当前 `main` 与标签至 GitHub。
* 确认 GitHub Release 包含与版本一致的 `.tgz` 安装包。

## Acceptance Criteria

* [x] `package.json` 与 Git 标签的版本完全一致，且标签指向包含该包版本的 `main` 提交。
* [x] 发布检查成功：格式、lint、类型、测试、构建、打包、包验证、安装 smoke test。
* [x] GitHub 上存在 `v0.1.1` Release，并有 `skillpin-0.1.1.tgz` 资产。
* [x] 未发布至公共 npm registry。

## Out of Scope

* 发布到公共 npm registry。
* 更改除版本发布所需内容之外的产品功能。

## Delivery Result

* `main`（提交 `6d49ec2`）及带注释标签 `v0.1.1` 已推送至 `origin`。
* GitHub Actions Release 工作流 `32962989771` 于 2026-08-26 成功完成全部验证和 Release 创建步骤。
* GitHub Release `SkillPin v0.1.1` 已发布，资产为 `skillpin-0.1.1.tgz`（189,222 bytes，SHA-256 `720b6877cba3aba82205cb2590f0040762873b3196f2cb644bef27b6d7d90be5`）。
* Release URL: https://github.com/qiuos/skillpin/releases/tag/v0.1.1
