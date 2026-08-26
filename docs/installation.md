# Installation

SkillPin requires **Node.js 22 or newer**. The package is intended for local tarballs, immutable Git references, or an organization-controlled private npm registry. Do not publish it to the public npm registry.

## Local tarball

From a repository checkout:

```sh
npm ci
npm run pack
npm install --global ./artifacts/skillpin-0.1.0.tgz
skillpin --version
```

For a non-global install, use an isolated prefix and invoke through npm:

```sh
npm install --prefix ./skillpin-tools ./artifacts/skillpin-0.1.0.tgz
npm exec --prefix ./skillpin-tools -- skillpin --version
```

## Immutable Git reference

Use a tag or full commit SHA, never a moving branch name:

```sh
npm install --global 'git+https://github.com/qiuos/skillpin.git#<full-commit-sha>'
skillpin --version
```

A Git install runs the repository `prepare` build so the CLI bundle and production web assets are created before npm packages the install.

## Private registry

Configure an organization-controlled registry, then install a versioned package:

```sh
npm config set registry https://registry.example.internal/
npm install --global skillpin@0.1.0
```

Publish only to that private registry after your organization has approved its package policy. The package's npm metadata requests restricted access and no command in this repository publishes it.

## Upgrade and uninstall

Reinstalling the same or a newer immutable package is safe for existing valid data:

```sh
npm install --global ./artifacts/skillpin-0.1.0.tgz
npm uninstall --global skillpin
```

SkillPin does not delete user configuration or a project's `.agents/skillpin.json` manifest during install, upgrade, reinstall, or uninstall. Future-schema config/manifest files are retained rather than overwritten.
