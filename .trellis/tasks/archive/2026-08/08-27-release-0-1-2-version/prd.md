# 发布 SkillPin 0.1.2 正式版本

## Goal

将 SkillPin 发布为 GitHub 正式版本 `0.1.2`，并由 Release 工作流生成并附加安装包 `skillpin-0.1.2.tgz`。本次版本包含 Web UI Vercel 近黑白产品风全站重设计（逻辑不变）。

## What I already know

- 当前 root `package.json` 版本：`0.1.1`；workspace 包仍为 `0.1.0`（与 0.1.1 发布时一致，仅 bump root）。
- 未指定版本号 → 按 `docs/releasing.md` 默认 patch：`0.1.1` → `0.1.2`。
- `main` 已含 UI 重设计提交 `7fd803e` 及后续 archive/journal；已推 origin。
- 正式发布：`npm version patch` → 质量/打包检查 → push `main` + `v0.1.2` → Actions 创建 Release 并上传 tgz。
- 不发布公共 npm registry。

## Requirements

- 稳定 SemVer `0.1.2`；标签 `v0.1.2` 与 `package.json` 一致。
- `npm version patch` 生成版本提交与 annotated tag。
- 发布前：format / lint / typecheck / test / build / pack / verify-package / test:package。
- 推送 `main` 与 `v0.1.2` 至 origin。
- 确认 GitHub Release 含 `skillpin-0.1.2.tgz`。

## Acceptance Criteria

- [ ] root `package.json` 版本 = `0.1.2`，tag `v0.1.2` 指向含该版本的 commit
- [ ] 发布检查全绿（format、lint、typecheck、test、build、pack、verify、smoke）
- [ ] GitHub Release `v0.1.2` 存在且附带 `skillpin-0.1.2.tgz`
- [ ] 未发布至公共 npm registry

## Definition of Done

- 版本 commit + tag 已 push
- Release workflow 成功
- 任务归档 + journal（finish-work）

## Out of Scope

- 公共 npm 发布
- 功能改动 / 再改 UI
- major/minor 升版（无 breaking / 大 feature 声明）

## Technical Notes

- 规范：`docs/releasing.md`
- 参考：archive `08-26-record-release-0-1-1`
- 命令：`npm version patch` → checks → `git push origin main --follow-tags`（或 push + push tag）
