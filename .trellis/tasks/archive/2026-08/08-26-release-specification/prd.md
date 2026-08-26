# 规范正式版本发布流程

## Goal

为 SkillPin 建立可执行、可复核的正式版本发布规范：未显式指定版本号时递增当前版本的末位；完成质量验证、推送至 GitHub、创建标签及 GitHub Release，并将安装包作为 Release 附件发布。

## Requirements

* 正式版本使用稳定的语义化版本号，标签格式为 `v<version>`，例如 `v0.1.1`。
* 用户未指定版本号时，基于根 `package.json` 的当前版本将 patch（末位）加 1，例如 `0.1.0` → `0.1.1`；发布命令使用 `npm version patch`。
* 用户指定版本号时，使用 `npm version <version>` 创建该稳定版本；发布规范应说明不能使用预发布版本号。
* 版本变更提交和标签推送到 `origin/main` 后，由 GitHub Actions 的 `v*` 标签触发器自动发布。
* 发布工作流必须安装依赖、构建运行时与安装包、校验安装包，并创建对应 GitHub Release。
* 发布工作流必须把唯一的 `artifacts/skillpin-<version>.tgz` 上传为 GitHub Release asset。
* 工作流必须验证：触发标签与根 `package.json` 的版本匹配；否则失败，避免错误代码/标签组合被发布。
* 发布文档必须列出操作顺序、预检、失败处理及验证发布资产的方式；不得发布至公共 npm registry。

## Acceptance Criteria

* [ ] 文档清楚定义默认版本号计算、显式版本号和稳定版本限制。
* [ ] 文档明确列出质量检查、版本提交、GitHub 推送、打标签、创建 Release、上传 `.tgz` 的顺序及命令。
* [ ] GitHub Actions 对推送的 `v*` 标签启动校验，但仅当标签精确符合 `v<major>.<minor>.<patch>` 时才创建正式 Release。
* [ ] GitHub Actions 在创建 Release 前执行 `npm ci`、构建、`npm run verify-package` 和 `npm run test:package`。
* [ ] 当 `v<version>` 标签和根 `package.json` 的 `version` 不一致时，工作流失败且不创建 Release。
* [ ] 成功运行后，GitHub Release 与标签同名，并包含唯一且版本一致的 `skillpin-<version>.tgz` 附件。
* [ ] 不增加公共 npm registry 发布行为。

## Definition of Done

* GitHub Actions workflow syntax and release behavior are validated locally as far as practical.
* Repository quality commands relevant to modified files pass.
* Documentation accurately matches the implemented automation.
* Existing CI behavior remains intact.

## Technical Approach

* 新增一个独立的发布工作流，监听 `push.tags: ["v*"]`；不更改现有跨平台 CI 工作流。
* 工作流通过 `GITHUB_TOKEN` 的 `contents: write` 权限创建 GitHub Release 和上传资产。
* 使用 Node.js 22、`npm ci`、项目既有格式/静态检查、`npm run build`、`npm run verify-package`、`npm run test:package` 生成并验证安装包。
* 在上传前读取根 `package.json`，校验标签去掉 `v` 后等于包版本，并校验唯一产物的名称为 `skillpin-<version>.tgz`。
* 在 `docs/` 中新增发布指南，并从 README 链接；指南将 `npm version patch` 作为未指定版本号的默认操作。
* 发布指南属于 npm 交付内容，因此扩展现有 `scripts/verify-package.mjs` 的文档白名单，要求归档包含 `docs/releasing.md`。

## Decision (ADR-lite)

**Context**：发布必须覆盖版本号、代码、Git 标签、Release 及安装包，且不能依赖 Actions 直接写入 `main` 分支。  
**Decision**：开发者在本地用 `npm version patch` 或 `npm version <version>` 创建版本提交和 `v<version>` 标签，再以 `git push origin main --follow-tags` 推送；GitHub Actions 仅对推送的版本标签构建、验证和发布。  
**Consequences**：代码、版本和标签在发布前已经是不可变的对应关系；发布工作流不会改写分支，但操作者仍需在本地执行版本提升及推送。

## Out of Scope

* 发布到公共 npm registry。
* GitHub Actions 网页表单手动输入版本号并自动改写 `main`。
* 变更应用运行时功能。

## Technical Notes

* 根 `package.json` 当前版本为 `0.1.0`，已有 `npm run pack`，生成 `artifacts/skillpin-<version>.tgz`。
* `npm run verify-package` 与 `npm run test:package` 已提供安装包校验和冒烟测试。
* Git remote `origin` 指向 `https://github.com/qiuos/skillpin.git`；目前没有版本标签。`.github/workflows/ci.yml` 仅包含质量检查。
* `README.md` 和 `docs/installation.md` 说明只支持本地 tarball、不可变 Git 引用或私有 registry，且不发布到公共 npm registry。
