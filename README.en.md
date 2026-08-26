# SkillPin

[简体中文](README.md)

SkillPin is a **local command-line tool** for managing skill sources in a project. Running `skillpin` starts a protected service only on `127.0.0.1` on the current computer and opens the bundled browser interface. It does not expose a LAN listener, remote API, account service, or background daemon.

## Features

- Manage local skill sources available to a project.
- Use the bundled browser workbench to browse and manage skills.
- Keep configuration and project manifests on the local machine.
- Deliver the CLI runtime and Vite production web assets in one npm package.

## Requirements

- Node.js **22 or newer**.
- Installation from local `.tgz` archives, immutable Git references, or an organization-controlled private npm registry.
- This repository **does not publish to the public npm registry**.

## Quick start

Build and install a local archive from a repository checkout:

```sh
npm ci
npm run pack
npm install --global ./artifacts/skillpin-<version>.tgz
skillpin
```

To prevent the browser from opening automatically:

```sh
skillpin --no-open
```

The service listens only on `http://127.0.0.1:<port>`. The CLI prints the local address; keep the process running and do not expose it through a proxy or LAN interface.

## Local data

- User configuration is stored in the current user's local configuration directory.
- The project manifest is stored at `.agents/skillpin.json` in the selected project.
- Install, upgrade, reinstall, and uninstall do not overwrite valid existing configuration or project manifests.

## Documentation

- [Installation](docs/installation.md)
- [Usage](docs/usage.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Releasing](docs/releasing.md)
- [Third-party notices and dependency inventory](THIRD_PARTY_NOTICES.md)

## Repository development

Run the complete delivery verification flow:

```sh
npm ci
npm run build
npm run pack
npm run verify-package
npm run test:package
```
