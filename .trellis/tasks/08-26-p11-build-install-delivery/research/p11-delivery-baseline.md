# P11 Delivery Baseline Research

Date: August 26, 2026

## Existing state

- The repository root is a private workspace named `skillpin`; the current distributable workspace is `@skillpin/cli`.
- `packages/cli/package.json` publishes only `dist` and declares `@skillpin/core@0.1.0` as an external dependency. In a clean consumer install, that unpublished workspace dependency is not a reliable distribution contract.
- `packages/web` already creates a Vite production build at `packages/web/dist`, but `scripts/build-package.mjs` currently does not copy it to the CLI archive.
- `LocalHttpServer` returns a static inline bootstrap placeholder for `/`; it does not serve the Vite build or its assets.
- `scripts/verify-package.mjs` currently checks only `package.json`, `dist/main.js`, and `dist/main.d.ts` in the tar archive.
- Generated TypeScript source maps (`*.js.map` and `*.d.ts.map`) include source paths and must not ship in the runtime tarball.
- `getUserConfigPath()` honors `HOME`/`XDG_CONFIG_HOME` on Linux, `HOME` on macOS, and `APPDATA` on Windows. These variables can isolate install/upgrade smoke checks.
- The P10 clean-checkout CI fixes already require portable npm CLI invocation on Windows and a `npm run test:e2e` core-build bootstrap. P11 must retain those contracts.

## Delivery design constraints

1. The final archive must be installable from a tarball, Git fixed ref, or private registry without publishing either workspace package independently.
2. Static files must be served from a verified package-relative directory. Request paths must not escape that root, and API/WebSocket routes keep their existing guards.
3. Tests cannot use the developer's global npm prefix or actual config directory.
4. The git-install acceptance must use an immutable tag or commit fixture rather than `main`.
5. The user deferred only native Windows Junction fallback evidence; this remains documented as a P10 manual validation rather than a completed P11 result.
