# 发布 SkillPin 0.1.13

## Goal

将已完成的连接状态与技能工作台优化作为正式私有 GitHub Release 交付，发布下一个补丁版本 0.1.13。

## Requirements

* 从干净的 `main` 分支将根 `package.json` 的版本从 0.1.12 升级到 0.1.13。
* 使用 `npm version patch` 创建版本提交及匹配的注释标签 `v0.1.13`。
* 从版本提交运行发布规范的完整验证：依赖安装、格式、lint、类型、单元、构建、打包、包内容验证和隔离安装烟测。
* 将 `main` 和标签一起推送到 `origin`，触发 GitHub Release 工作流。
* 验证 GitHub Release `v0.1.13` 成功生成并附带唯一的 `artifacts/skillpin-0.1.13.tgz`。
* 不向 npm 公共仓库发布。

## Acceptance Criteria

* [ ] `package.json` 的版本为 0.1.13，且 Git 标签为 `v0.1.13`。
* [ ] 所有发布前检查通过。
* [ ] `origin/main` 与本地版本提交一致，`origin` 已有 `v0.1.13`。
* [ ] GitHub Release 工作流成功，发布资产名称为 `skillpin-0.1.13.tgz`。
* [ ] 未执行 `npm publish`。

## Definition of Done

* 版本提交、标签、任务归档和会话记录均完成。
* GitHub Release 的状态和交付资产已经核验。

## Out of Scope

* 不改变功能代码。
* 不向 npm registry 发布。

## Technical Notes

* 发布契约见 `docs/releasing.md` 和 `.github/workflows/release.yml`。
* 当前版本为 0.1.12；根据发布规范且未指定版本号，使用 patch 增量发布 0.1.13。
