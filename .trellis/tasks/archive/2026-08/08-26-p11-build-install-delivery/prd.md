# SkillPin P11: Build, Installation, Upgrade, and Delivery

## Goal

Deliver SkillPin as one installable npm distribution that works from a local tarball, a Git tag/commit, or a private registry. The installed `skillpin` command must include the browser application and all runtime code needed to start the protected local session; public npm publication is explicitly out of scope.

## Prerequisite Exception

P10's hosted Ubuntu, macOS, and Windows CI matrices passed in GitHub Actions run `32949151022` on August 26, 2026. The user explicitly deferred the native Windows Junction fallback test for later manual validation on August 26, 2026 and directed work to continue with P11. The P10 evidence remains open for that native-only item; P11 must not claim it has been verified.

## Authoritative Requirements

- Source plan: `/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin实施计划.md`, P11 “构建、安装、升级与交付”.
- Product design: `/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin产品技术一体化方案.md`, delivery, installation, upgrade, and platform-permission requirements.

## Requirements

1. Produce one npm tarball whose package metadata exposes the `skillpin` bin, includes the compiled CLI/runtime and the production web build, and excludes source tests, fixtures, development dependencies, source maps, and machine-specific source paths.
2. Replace the server's development placeholder page with the bundled production web application while preserving loopback-only Host/Origin request guards, bootstrap cookies, authenticated API routes, and WebSocket behavior.
3. Make root packaging reproducible: `npm run pack` builds the runtime and web assets, creates exactly one archive in `artifacts/`, and `npm run verify-package` validates archive contents, metadata, executable entrypoint, asset references, and dependency/license inventory.
4. Add a hermetic package smoke test that installs the generated archive into an isolated prefix, executes `skillpin --help` and `skillpin --version`, starts a no-browser local session against a temporary project, verifies that the bundled HTML is served, then uninstalls it. The smoke test must not mutate the developer's global npm prefix or real user configuration.
5. Verify a Git installation pinned to an immutable local tag/commit fixture, not a moving branch. Validate upgrade and reinstall behavior against pre-existing valid config and project manifest files, including rejection/preservation of unsupported future-schema files.
6. Keep runtime dependencies self-contained in the distributed package so clean local/Git/private-registry installations do not require unpublished workspace packages.
7. Write `README.md`, `docs/installation.md`, `docs/usage.md`, and `docs/troubleshooting.md`. Cover Node 22+, local tarball/Git/private registry installation, upgrade/uninstall, the local-only session model, configuration/manifest preservation, macOS/Linux symlink notes, and Windows Junction/symlink permission limitations. State that native Windows Junction fallback remains a deferred manual P10 validation.
8. Extend CI with package-content and isolated-install verification on Ubuntu, macOS, and Windows. Public registry publication is not a CI action and is not part of this task.

## Non-goals

- Publishing to the public npm registry.
- Changing existing product behavior, persistence schemas, source selection, link transactions, or protected local API contracts except where static-asset serving needs a narrow delivery boundary.
- Treating hosted Windows CI as proof of the privilege-denied Junction fallback.
- Adding a remote service, account system, database, background daemon, Electron/Tauri shell, or Docker end-user runtime.

## Acceptance Criteria

- [ ] `npm run pack` produces one tarball from a clean checkout; its `bin` resolves to executable JavaScript and its files are explicitly whitelisted.
- [ ] A fresh isolated install from the tarball has no dependency on `@skillpin/core` or another unpublished workspace package and runs `skillpin --help` and `skillpin --version`.
- [ ] Starting the installed command serves the bundled production SPA (not the former inline placeholder) and the SPA assets remain same-origin with the protected API.
- [ ] Static serving rejects traversal/missing assets safely and continues to enforce loopback Host/Origin protections before returning content.
- [ ] Archive validation fails on forbidden files, source maps, missing web entry/assets, malformed bin metadata, unexpected executable payloads, or missing required license/dependency inventory.
- [ ] A fixed Git tag/commit install succeeds in an isolated prefix; upgrade/reinstall leaves valid config and project manifest data unchanged and preserves future-schema files instead of overwriting them.
- [ ] Package smoke checks and package verification run in the three-OS GitHub Actions matrix.
- [ ] Installation, usage, and troubleshooting documentation provides reproducible commands and platform-specific permission guidance.

## Initial Research Decisions

- The current `@skillpin/cli` archive contains only TypeScript compiler output and imports `@skillpin/core` externally, so it cannot satisfy the single-package clean-install requirement without changing the distribution build.
- The current loopback server emits an inline placeholder HTML page; P11 must serve the Vite production build packaged with the CLI.
- Existing `npm run pack` and `npm run verify-package` establish the command names but verify only CLI `dist/main.*`; P11 expands rather than removes those root entrypoints.
- Package smoke tests must use temporary npm cache, prefix, HOME/XDG/APPDATA, project, and source directories to avoid changing developer state.
