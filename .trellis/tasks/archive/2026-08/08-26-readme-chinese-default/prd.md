# README 默认中文化

## Goal

将仓库默认 README 改为中文，同时保留一份内容等价的英文 README，方便中文用户优先阅读并让英语用户仍可访问项目简介和交付说明。

## Requirements

* 根 `README.md` 必须成为默认显示的中文 README。
* 当前英文 README 内容必须保留为 `README.en.md`，并与中文 README 提供双向语言切换链接。
* 两个 README 都要准确说明：项目为本地命令行技能源管理器、仅监听 `127.0.0.1`、要求 Node.js 22+、不发布到公共 npm registry。
* 两个 README 都必须链接到安装、使用、故障排除、发布和第三方声明文档。
* 英文 README 必须随 npm 安装包发布，不能因为改名而丢失；包校验需允许并要求该文件。
* 除 README 语言入口外，不翻译现有 `docs/` 交付文档，也不改变运行时行为或发布流程。

## Acceptance Criteria

* [ ] 打开仓库根目录的 `README.md` 时，内容默认以中文呈现。
* [ ] `README.en.md` 保留等价的英文内容，且中英文 README 互相可跳转。
* [ ] 中英文 README 都引用现有五类交付文档：安装、使用、故障排除、发布、第三方声明。
* [ ] `npm run pack && npm run verify-package` 成功，并验证压缩包同时包含 `README.md` 与 `README.en.md`。
* [ ] 不改变现有 CLI、Web、安装或 GitHub Release 的行为。

## Definition of Done

* Markdown formatting passes.
* Package verification passes after building a tarball.
* README links resolve to existing repository files.

## Technical Approach

* 将现有英文 `README.md` 迁移为 `README.en.md`，并添加位于页面顶部的语言链接。
* 新写根 `README.md` 的中文等价内容，并在顶部链接英文版。
* 将 `README.en.md` 纳入根 `package.json` 的 `files` 白名单；扩展 `scripts/verify-package.mjs` 的必需/允许文档清单，防止未来打包遗漏英文版。

## Decision (ADR-lite)

**Context**：GitHub 与 npm 默认展示根 `README.md`，用户要求中文版为默认入口，同时现有英文信息仍有价值。  
**Decision**：保留 `README.md` 作为中文默认入口，并以 `README.en.md` 保留英文等价说明。  
**Consequences**：需要维护两份简短的项目入口说明，并将英文版显式加入发布包白名单；其余长篇交付文档暂保持英文。

## Out of Scope

* 翻译 `docs/installation.md`、`docs/usage.md`、`docs/releasing.md` 或 `docs/troubleshooting.md`。
* 修改包版本或公开发布到 npm。
* 修改应用程序功能。

## Technical Notes

* 当前 `README.md` 为英文且包含项目简介、Node 版本、发布限制和交付文档链接。
* `package.json` 的 `files` 白名单当前仅显式列出 `README.md`；`scripts/verify-package.mjs` 当前将根 README 作为安装包必需文档。
* 用户在 2026 年 8 月 26 日明确要求“README 增加中文版，默认中文版”。
