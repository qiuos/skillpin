# 实现 SkillPin P0：仓库与质量基线

## Goal

为 SkillPin 建立可构建、可测试且具有清晰模块边界的 TypeScript npm workspace。此阶段只交付开发与质量基线，不实现扫描、链接、服务或 Web 业务功能。

## What I already know

- 产品与实施方案位于 Obsidian：`/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/`。
- `SkillPin实施计划.md` 将 P0 定义为“仓库与质量基线”，要求创建 `core`、`cli`、`web` 三个 npm workspace 包。
- 系统方案明确采用 Node.js + TypeScript；Web 使用 React + TypeScript + Vite；测试覆盖单元、浏览器端到端和三平台 CI。
- 模块边界：`core` 不依赖 `cli` 或 `web`；`cli` 不依赖 Web 源码（最终仅可使用 Web 构建产物）。
- 仓库当前仅有 Trellis 初始化文件，尚无应用源代码或 package 配置。

## Requirements

- [x] 创建 npm workspace 根配置和锁文件。
- [x] 建立 `@skillpin/core`、`@skillpin/cli`、`@skillpin/web` 三个 TypeScript 包。
- [x] 配置共享 TypeScript 严格模式、ESLint、Prettier。
- [x] 配置 Vitest 单元测试和 Playwright 浏览器端到端测试入口。
- [x] 配置 macOS、Linux、Windows 的 CI 质量入口。
- [x] 提供根级 `dev`、`build`、`test`、`typecheck`、`lint`、`format`、`pack`、`verify-package` 命令。
- [x] 在 core 中建立可复用的 `Result` 和错误基础类型；CLI 与 Web 均应引用 core。
- [x] 用 lint 规则禁止包间循环依赖，并通过包依赖图落实 core/cli/web 边界。
- [x] CLI 输出临时版本信息；Web 渲染空应用壳。

## Acceptance Criteria

- [x] `npm run typecheck` 成功。
- [x] `npm test` 成功。
- [x] `npm run build` 成功并生成三个包的产物。
- [x] `npm run lint`、`npm run format:check` 成功。
- [x] `npm run pack` 创建 CLI tarball，`npm run verify-package` 能验证其关键内容。
- [x] CLI 构建产物可执行并输出版本信息。
- [x] Web 构建产物在 Playwright 中显示 SkillPin 空应用壳。
- [x] CI 配置包含 Linux、macOS、Windows 三个平台质量矩阵及浏览器测试入口。

## Out of Scope

- 技能源扫描、配置、链接、文件事务和跨平台链接适配器（P1）。
- 本地 HTTP/WebSocket 服务、会话管理和真实 Web UI（后续阶段）。
- 最终 npm 分发包中嵌入 Web 产物、安装/升级验证（P11）。
- 数据库、远程服务、Electron/Tauri、Docker 最终用户运行环境。

## Technical Notes

- 原始依据：`SkillPin产品技术一体化方案.md` §8.1–8.5 与 `SkillPin实施计划.md` P0。
- 具体依赖版本由 npm lockfile 锁定；设计方案不预先绑定版本。
- P0 只允许设计中定义的三个部署/职责包，以避免过早细分。
