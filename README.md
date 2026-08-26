# SkillPin

SkillPin is a local-only command-line application for managing skill sources in a project. The `skillpin` command starts a protected service on `127.0.0.1` and opens the bundled browser interface. It does not expose a LAN listener, remote API, account service, or background daemon.

- **Node.js:** 22 or newer
- **Distribution:** one npm package containing the CLI runtime and Vite production web assets
- **State:** user configuration and project manifests stay on the local machine
- **Publication:** this repository does not publish the package to the public npm registry

See the delivery guides:

- [Installation](docs/installation.md)
- [Usage](docs/usage.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Third-party notices and dependency inventory](THIRD_PARTY_NOTICES.md)

For repository development, run `npm ci`, then `npm run build`, `npm run pack`, `npm run verify-package`, and `npm run test:package`.
