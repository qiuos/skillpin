# SkillPin

[English](README.en.md)

SkillPin 是一个用于管理项目技能来源的**本地命令行工具**。运行 `skillpin` 后，它只会在当前电脑的 `127.0.0.1` 上启动受保护的服务，并打开内置的浏览器界面；它不会开放局域网监听、远程 API、账户服务或后台守护进程。

## 特性

- 管理项目可用的本地技能来源。
- 内置浏览器工作台，便于查看与管理技能。
- 仅使用本地配置和项目清单，不上传项目数据。
- 以单个 npm 安装包交付 CLI 运行时和 Vite 生产环境 Web 资源。

## 环境要求

- Node.js **22 或更高版本**。
- 支持从本地 `.tgz` 安装包、不可变 Git 引用或组织控制的私有 npm registry 安装。
- 本项目**不会发布到公共 npm registry**。

## 快速开始

从仓库检出目录构建并安装本地安装包：

```sh
npm ci
npm run pack
npm install --global ./artifacts/skillpin-<version>.tgz
skillpin
```

如不希望自动打开浏览器，可运行：

```sh
skillpin --no-open
```

服务只监听 `http://127.0.0.1:<port>`。命令行会显示本机访问地址；请保持进程运行，并且不要通过代理或局域网暴露该服务。

## 本地数据

- 用户配置保存在当前用户的本地配置目录。
- 项目清单保存在目标项目的 `.agents/skillpin.json`。
- 安装、升级、重新安装或卸载不会覆盖有效的现有配置或项目清单。

## 文档

- [安装](docs/installation.md)
- [使用](docs/usage.md)
- [故障排除](docs/troubleshooting.md)
- [正式发布](docs/releasing.md)
- [第三方声明与依赖清单](THIRD_PARTY_NOTICES.md)

## 仓库开发

运行完整的交付验证流程：

```sh
npm ci
npm run build
npm run pack
npm run verify-package
npm run test:package
```
