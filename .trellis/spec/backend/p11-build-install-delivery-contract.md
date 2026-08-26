# P11 Build and Install Delivery Contract

## 1. Scope / Trigger

Apply this contract when changing root package metadata, runtime/web distribution builds, package verification, installed CLI startup, static production-asset serving, or package CI. P11 delivers one private `skillpin` npm package; `@skillpin/core` and `@skillpin/cli` remain private workspace implementation packages and must never be required by a clean installed runtime.

This contract supplements, but does not weaken, the P5 local-session HTTP/WebSocket contract. The P10 native Windows case in which directory-symlink creation is denied and Junction fallback is used remains a deferred manual validation as of **August 26, 2026**. Do not represent it as verified by package or hosted-CI checks.

## 2. Signatures

```text
npm run build
  -> packages/core + packages/cli + packages/web builds
  -> dist/main.js + dist/web/**

npm run pack
  -> exactly one artifacts/skillpin-<version>.tgz

npm run verify-package
  -> archive metadata/content/license/asset validation

npm run test:package
  -> isolated tarball install + immutable Git-commit install smoke test

GET|HEAD /                 // Vite index; issues bootstrap cookie
GET|HEAD /assets/<file>   // package-relative static asset; never issues cookie
```

The installed entrypoint is the root manifest bin mapping: `skillpin -> ./dist/main.js`. The bundle defines `__SKILLPIN_VERSION__`; source execution falls back to its package-relative manifest for `--version`. The static-root data flow is fixed:

```text
main.ts dist/web -> runCli({ staticDirectory }) -> SessionManager.start()
  -> LocalHttpServer({ staticDirectory }) -> readStaticAsset()
```

## 3. Contracts

- Root `package.json` must whitelist only `dist`, delivery docs, and third-party notices; it exposes the `skillpin` bin, requires Node 22+, is `UNLICENSED`, and requests restricted registry access. The packaged runtime is one Vite SSR bundle with `@skillpin/core` and `yaml` inlined, plus copied Vite production `dist/web` assets. Source maps, workspace source, tests, fixtures, and `node_modules` do not ship.
- `npm run pack` builds first, clears `artifacts/`, and invokes npm packaging with lifecycle scripts disabled. It uses a temporary npm cache and produces exactly one tarball. `npm run verify-package` must reject any archive file not on the allowlist, source maps, local source paths, unexpected executable payloads, missing docs/notices, missing referenced Vite assets, a missing executable bundle, or an external `@skillpin/core` dependency.
- With `staticDirectory` supplied, `GET /` serves package `index.html` and only this navigation issues the short-lived bootstrap cookie. `/assets/*` reads exclusively below the real static root, permits only recognized production extensions, returns `404` for missing/invalid/escaping paths, and sends `Cache-Control: no-store` with `X-Content-Type-Options: nosniff`. The source-only inline page is retained only when no static directory is supplied.
- Static navigation may omit `Origin`, but every supplied `Origin` must match the current `http://127.0.0.1:<port>` session origin. Static and API paths continue to require the session Host, and API/WebSocket routes retain P5 credential/origin enforcement. Raw `/assets/...` routing must reach the static boundary before URL normalization so encoded traversal cannot bypass validation.
- `test:package` must isolate npm cache/prefix, HOME/XDG configuration, APPDATA, and project state in a temporary directory. It validates `--help`, injected `--version`, package HTML/assets, bootstrap/session shutdown, tarball uninstall/reinstall, preservation of valid and unsupported future-schema user/project files, and a `git+file://...#<commit>` install using a newly created immutable local Git commit. It must clean up afterward and never alter global npm/user configuration.
- CI runs build, pack, package verification, and the isolated package smoke test on Ubuntu, macOS, and Windows. It does not publish to a registry.

## 4. Validation & Error Matrix

| Condition | Required outcome |
|---|---|
| `dist/web` is absent before distribution bundling | Fail the build; never emit a CLI missing its browser application. |
| Package archive has no single tarball, invalid bin, map/source/test/fixture, unapproved file, local source path, missing Vite reference, or external `@skillpin/core` | `verify-package` fails with a specific archive validation error. |
| Request path has invalid URI encoding, NUL, backslash, `.`/`..` segment, realpath escape/symlink escape, unsupported extension, or missing file | Static server returns `404`; it does not disclose filesystem paths. |
| Static request method is not GET/HEAD | Return `405` with no-store headers. |
| Static request Host is not the loopback session or a supplied Origin is foreign | Return `403`; do not issue cookie or asset body. |
| Installed archive cannot execute `skillpin`, serve Vite HTML/assets, bootstrap, or shut down | `test:package` fails. |
| Reinstall sees valid or future schema configuration/manifest data | Preserve files unchanged; do not delete, migrate, or overwrite as a packaging side effect. |
| Native Windows Junction fallback is not manually tested | Keep P10 evidence open and document the deferred procedure; do not mark it complete. |

## 5. Good / Base / Bad Cases

- **Good:** `npm run pack`, `npm run verify-package`, and `npm run test:package` succeed; an installed CLI starts on loopback, serves Vite HTML and its same-origin asset, the page bootstraps a session, then shuts down without changing isolated configuration or project manifests.
- **Base:** a source-run CLI has no `staticDirectory`; `GET /` still uses the P5 inline fallback so existing source-level unit/integration tests remain valid. A static navigation without an `Origin` is accepted, while an asset with the correct Host and session Origin is served without a cookie.
- **Bad:** publish `@skillpin/core` separately or leave it as an archive runtime dependency; serve arbitrary package files, normalize `/assets/%2e%2e/...` before validation, put a bootstrap cookie on every asset, install from a moving Git branch, or treat hosted Windows CI as proof of Junction fallback.

## 6. Tests Required

- Integration coverage must start a session with a temporary static root and assert bundled root HTML, asset content type, bootstrap cookie only on `/`, missing/encoded-traversal `404`s without path disclosure, and Host/foreign-Origin rejection.
- Package verification must parse the generated tarball and assert root bin/metadata, executable CLI, docs/notices, absence of source maps and development artifacts, no local source paths, no external workspace runtime dependency, and actual Vite asset references.
- Package smoke coverage must use temporary npm/user/project state; test tarball help/version/start/static asset/bootstrap/shutdown/uninstall/reinstall plus preservation of valid and future schemas. It must also install from an immutable local Git commit, not `main` or a tag/branch that could move.
- The CI `quality` matrix on Ubuntu, macOS, and Windows must execute `npm run test:package` after `npm run pack` and `npm run verify-package`. Retain P10 platform and browser checks independently.

## 7. Wrong vs Correct

```ts
// Wrong: URL normalization can remove the encoded traversal before the static
// boundary sees it, and arbitrary package-relative files could be exposed.
const url = new URL(request.url ?? "/", origin);
if (url.pathname.startsWith("/assets/")) {
  return serve(path.join(staticDirectory, url.pathname));
}

// Correct: select raw /assets routing, then validate decoding and realpaths
// exclusively under the static root.
const rawPath = (request.url ?? "/").split("?", 1)[0] ?? "/";
if (rawPath.startsWith("/assets/")) {
  const asset = await readStaticAsset(staticDirectory, request.url ?? rawPath);
  // invalid/escaping paths are indistinguishable from a 404
}
```
