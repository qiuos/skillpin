# Research: P5 server/session integration map

- Query: Research the existing repository for P5 CLI, local HTTP/WebSocket server, secure session lifecycle, P4 Node API integration, package layout, scripts/dependencies/tests, and backend contracts.
- Scope: internal
- Date: 2026-08-26

## Findings

### Files found

| Path | Description |
| --- | --- |
| `package.json` | Root ESM workspace, Node `>=22`, and the authoritative quality/build/package scripts. |
| `packages/cli/package.json` | Distributable `skillpin` bin currently maps to `dist/main.js`; CLI has only an `@skillpin/core` dependency. |
| `packages/cli/src/main.ts` | The entire current CLI: prints a P0 version banner and has no argument parsing, server, session, or test code. |
| `packages/core/package.json` | Keeps `@skillpin/core` root browser-safe and declares Node-only `platform`, `changes`, `persistence`, `catalog`, and `project` subpaths. |
| `packages/core/src/index.ts` | Browser-safe root exports Result helpers and domain contracts, including the existing session state contract. |
| `packages/core/src/domain/session-state.ts` | Provides `starting → running → waiting-to-exit/exiting` and reconnect cancellation transition rules; no timer/registry implementation. |
| `packages/core/src/domain/project-state.ts` | Browser-safe project snapshot types that can be reused in P5 API contract payloads. |
| `packages/core/src/domain/errors.ts` | Stable serializable `CoreError` boundary already includes P4 error codes and safe error serialization. |
| `packages/core/src/project/index.ts` | Node-only P4 inspection/lock exports. |
| `packages/core/src/changes/index.ts` | Node-only P4 planning/application exports, including the P5-oriented `ProjectChangeService`. |
| `packages/core/src/changes/link-transaction.ts` | P4 orchestration: lock, fresh inspect, pure plan/validation, transaction, fresh snapshot, and process-local successful request cache. |
| `packages/core/src/project/project-snapshot-service.ts` | Read-only project inspector used to pin and inspect a target project. |
| `packages/core/src/platform/index.ts` and `packages/core/src/platform/node-platform-link-adapter.ts` | Node platform adapter construction boundary needed by `ProjectSnapshotService`/`ProjectChangeService`. |
| `packages/core/src/project/project-p4.test.ts` | Real-filesystem P4 test fixture and cleanup style; establishes P4 caller/service construction. |
| `packages/web/src/main.tsx`, `packages/web/index.html`, `packages/web/vite.config.ts` | Minimal Vite shell only; it is not currently a P5 static-server contract. |
| `vitest.workspace.ts` | Vitest includes core-source tests plus every `tests/**/*.test.ts`; CLI source tests will be discovered if named `*.test.ts`. |
| `eslint.config.js` | Enforces core ← no CLI/Web, CLI ← no Web source, and Web ← no CLI imports. |
| `scripts/build-package.mjs`, `scripts/verify-package.mjs` | CLI archive tooling currently validates only CLI `dist/main.*`; it does not package static Web assets. |
| `.trellis/spec/backend/{directory-structure,error-handling,logging-guidelines,quality-guidelines,project-change-transaction-contract}.md` | Applicable package, error/logging, quality, and mandatory P4 integration contracts. |

### Current layout and package boundary

- The repository is an npm workspace with `packages/core`, `packages/cli`, and `packages/web`; the root requires Node `>=22` (`package.json:1-38`). Runtime package TypeScript uses strict settings (`tsconfig.base.json:2-13`) and CLI/Core compile as NodeNext (`packages/cli/tsconfig.json:2-12`, `packages/core/tsconfig.json:2-13`).
- `@skillpin/core` root intentionally exports only `Result` helpers and domain contracts (`packages/core/src/index.ts:1-9`). Node-only functionality is exposed only through declared subpaths (`packages/core/package.json:8-32`), matching the backend boundary rule (`.trellis/spec/backend/directory-structure.md:15-29`).
- Existing `SessionState` is already browser-safe and has statuses `starting`, `running`, `waiting-to-exit`, and `exiting`; legal transitions make disconnect grace-period cancellation (`waiting-to-exit → running`) explicit (`packages/core/src/domain/session-state.ts:3-42`). It is a pure transition helper, so registry ownership, server handles, timers, credentials, and WebSocket clients belong in CLI runtime code rather than core root.
- The CLI has one file and no module layout yet: `main.ts` imports `ok`, fixes the string version to `0.1.0`, and prints a baseline banner (`packages/cli/src/main.ts:1-8`). No existing parser, HTTP listener, browser opener, server framework, WebSocket implementation, or CLI tests exist.
- ESLint permits CLI to import published Core modules but forbids CLI importing `@skillpin/web` or its source (`eslint.config.js:70-77`). Therefore P5 static assets need a package/build artifact boundary (or assets owned by CLI), not a direct import of `packages/web/src`.

### P4 Node API available to P5

- Use `ProjectSnapshotService` from `@skillpin/core/project`, constructed with a `PlatformLinkAdapter`, normalized `projectDirectory`, and optional `sources`; it returns `Promise<Result<ProjectSnapshot, CoreError>>` and is explicitly read-only (`packages/core/src/project/index.ts:1-16`, `packages/core/src/project/project-snapshot-service.ts:25-46`; contract `.trellis/spec/backend/project-change-transaction-contract.md:11-13,31-41`). It is the correct startup inspection boundary after the CLI resolves the target's real path.
- Construct its adapter from the Node-only `@skillpin/core/platform` entrypoint; the platform adapter is intentionally outside the browser-safe root (`packages/core/package.json:13-20`, `packages/core/src/platform/index.ts:1-22`).
- `ProjectChangeService` is the mandatory P4 mutation boundary for P5 (`packages/core/src/changes/index.ts:9-19`; `.trellis/spec/backend/project-change-transaction-contract.md:5-7`). Its `apply({ baseRevision, requestId, selections })` owns acquire/fresh inspection/plan/validate/apply/refresh flow (`packages/core/src/changes/link-transaction.ts:162-254`). HTTP routes must not call link transactions directly.
- `ProjectChangeService` caches only successful request results by lexical project directory plus request ID and returns `idempotent: true` for a repeat (`packages/core/src/changes/link-transaction.ts:179-186,244-250`). It returns retryable `PROJECT_APPLY_IN_PROGRESS` while the non-queuing in-process project lock is held (`packages/core/src/changes/link-transaction.ts:188-199`; `packages/core/src/project/project-lock.ts:7-34`). P5 should preserve this service for the lifetime of a pinned session so that cache/lock semantics survive API requests.
- The P4 project contract validates safe request IDs before temporary-path construction, protects unknown/mismatched filesystem content, and requires a fresh snapshot at apply time (`.trellis/spec/backend/project-change-transaction-contract.md:33-41,45-54`). P5 should pass client mutation IDs through only after its own API validation and should serialize expected `CoreError`s with `serializeSkillPinError` (`packages/core/src/domain/errors.ts:57-92`).
- P4 mutation may await filesystem transaction work; shutdown must stop accepting new API/WebSocket requests and await tracked in-flight `ProjectChangeService.apply()` calls before closing the server. There is no cancellation API in P4, and forcibly aborting it would violate the P5 PRD's non-interruption requirement.

### Existing test, build, and packaging patterns

- Vitest discovers `packages/core/src/**/*.test.ts` and `tests/**/*.test.ts` (`vitest.workspace.ts:3-8`). P4 uses `mkdtemp` fixtures and `afterEach` recursive cleanup (`packages/core/src/project/project-p4.test.ts:1-32`), builds a production-shaped `ProjectChangeService` from `NodePlatformLinkAdapter` and `ProjectSnapshotService` (`packages/core/src/project/project-p4.test.ts:84-99`), and asserts structured `Result` values rather than catching expected errors (`packages/core/src/project/project-p4.test.ts:201-299,360-387`).
- Existing tests cover P4 add/replace/remove/idempotency/revision conflict and the normalized one-lease lock (`packages/core/src/project/project-p4.test.ts:201-299,390-398`). They do not cover CLI parsing, HTTP, WebSocket, session security, loopback binding, browser opening, signals, or the idle timer.
- Required root quality commands are `format:check`, `lint`, `typecheck`, `test`, and `build`; CLI package changes additionally require `pack` plus `verify-package` (`.trellis/spec/backend/quality-guidelines.md:9-21`). CI runs those commands on Ubuntu, macOS, and Windows (`.github/workflows/ci.yml:12-33`).
- The CLI archive presently includes exactly the CLI package manifest plus `dist/main.{js,d.ts}` and maps `skillpin` to `dist/main.js` (`packages/cli/package.json:6-18`, `scripts/verify-package.mjs:48-56`). `@skillpin/web` builds separate Vite assets (`packages/web/package.json:7-16`, `packages/web/vite.config.ts:1-6`); those assets are absent from the CLI package archive. A local server cannot reliably serve the current web bundle after `npm install @skillpin/cli` without an explicit asset-copy/package strategy.

### Dependencies and external references

- Existing runtime dependency inventory: CLI has only `@skillpin/core` (`packages/cli/package.json:14-16`); Core has `yaml ^2.9.0` (`packages/core/package.json:34-36`); Web has React `^19.2.8` and React DOM `^19.2.8` (`packages/web/package.json:12-16`). The repository's installed lockfile has no `ws`, `open`, or `commander` package entry (searched `package-lock.json` and top-level `node_modules` on 2026-08-26).
- P5's stated baseline is Node built-ins (`http`, `crypto`, `path`, `fs`) plus an explicit maintained WebSocket dependency only if needed. Node version is fixed at `>=22`, so the implementation should verify the selected API/dependency against Node 22 support before adding it. No external documentation was consulted for this internal repository map.

## Implementation Map

### Recommended file/module ownership

| Proposed file | Responsibility | Key imports/exports | Tests |
| --- | --- | --- | --- |
| `packages/core/src/domain/session-api.ts` (or similarly named browser-safe contract module) | Define only JSON/WebSocket payload, bootstrap, serialized error, session/status, and event envelope types shared by Web and CLI. | Export from `packages/core/src/domain/index.ts`, therefore the safe `@skillpin/core` root. Must not import `node:*`, P4 services, or CLI types. | `packages/core/src/domain/domain.test.ts` or a colocated contract test. |
| `packages/cli/src/command/parse-cli.ts` | Pure parsing/validation for positional target, `--target`, `--no-open`, `--port`, help/version, and deterministic diagnostic/exit mapping. | CLI-only types; inject argv/cwd/version for tests. | Colocated `parse-cli.test.ts` for accepted combinations, conflicts, invalid/duplicate values, help/version. |
| `packages/cli/src/session/target-project.ts` | Resolve default cwd/explicit target, require directory, canonicalize via `realpath`, construct the irreversible fingerprint/session key, and create P4 adapter/snapshot/change service dependencies. | `@skillpin/core/platform`, `@skillpin/core/project`, `@skillpin/core/changes`; use `ProjectSnapshotService` before session registration. | Colocated real-filesystem target validation/symlink-alias tests. |
| `packages/cli/src/session/session-registry.ts` | Process-local `realProjectPath → session` registry; reuse existing running/waiting session, retain one `ProjectChangeService` per session, coordinate close/remove. | SessionState transition helper from `@skillpin/core`; expose a narrow `startOrReuse`/`close` interface. | Colocated reuse, independent projects, transition, close/removal tests with injected clock/server factory. |
| `packages/cli/src/security/session-credentials.ts` | Generate/consume one-time bootstrap token, issue/verify short-lived credentials with constant-time comparison, validate host/origin/loopback metadata, and redact secrets from errors/logs. | Node `crypto`; browser-safe contract types only. Do not make secrets JSON-loggable. | Colocated single-consumption, expiry, wrong/missing credential, bad origin/host, and no-secret-in-diagnostic tests. |
| `packages/cli/src/server/local-server.ts` | Own loopback HTTP server, host/origin checks, static files, health/bootstrap API, future route registration seam, and WebSocket upgrade delegation. | Node `http`; session registry/session facade; Core contract types and `serializeSkillPinError`. Bind only loopback. | Integration tests against real `127.0.0.1` listener for random/explicit ports, host/origin/credential/CORS behavior, bootstrap. |
| `packages/cli/src/server/websocket-hub.ts` | Authenticate upgrades, heartbeat, page client count, monotonically increasing session event sequence, broadcast, disconnect callbacks. | Explicit WebSocket dependency/API selected for Node 22; session facade and contract event envelope. | Real client integration tests: auth rejection, heartbeat, count, monotonic sequence, broadcast, reconnect. |
| `packages/cli/src/session/session-lifecycle.ts` | Implement 60-second idle close timer, reconnect cancellation, explicit close, signal-driven graceful close, stop-accepting phase, in-flight P4 apply tracking, final registry removal. | Session state helper; injected timers and async drain hooks. | Fake-timer/unit tests plus integration test proving close waits for an injected pending apply. |
| `packages/cli/src/browser/open-browser.ts` | Best-effort platform browser opening; never include bootstrap/session credential in terminal diagnostics. | Node child-process/platform logic or a selected tiny dependency; inject launcher. | Colocated success/failure/`--no-open` tests. |
| `packages/cli/src/main.ts` | Thin executable composition root: parse, start/reuse, print redacted usable address, best-effort open, signal setup, deterministic exits. | All CLI modules above; no Web-source imports. | Prefer a subprocess or injected-stdio integration test. |
| `scripts/build-package.mjs` / `scripts/verify-package.mjs` and `packages/cli/package.json` | Add an intentional web-static-asset copy/package path and assert it is present in the tarball if P5 serves the production bundle. | Build web before packaging/copy; archive file list must include static assets. | Existing `npm run pack && npm run verify-package` checks updated to verify required static entry/assets. |

### P5 exports and API boundary

1. **Core root:** add only browser-safe API contracts to `@skillpin/core`; retain Node-free root behavior. Existing export tests cover Result helpers only (`packages/core/src/index.test.ts:1-14`), so add a regression that imports the new contract through the root without causing Node-runtime imports.
2. **Core Node subpaths:** P5 CLI should import P4 only through `@skillpin/core/project`, `@skillpin/core/changes`, and `@skillpin/core/platform`, per the explicit P4 contract (`.trellis/spec/backend/project-change-transaction-contract.md:5-8`). Do not expose the P5 server/secret implementation from core.
3. **CLI boundary:** publish the command through existing `bin.skillpin → ./dist/main.js` (`packages/cli/package.json:6-9`). Keep HTTP route registration behind a CLI-local interface/factory so P6–P9 add routes without changing transport/security gates.
4. **Web boundary:** the existing Web app may import shared root contract types but may not import CLI (`eslint.config.js:80-86`). P5 should not require Web source at runtime; serve an explicitly packaged asset directory instead.

### Test matrix to add

- **CLI parser:** default cwd, positional/`--target`, mutually invalid forms, invalid/missing port values, `--no-open`, help, version, stable output and exit status.
- **Target and registry:** invalid/non-directory target, realpath alias deduplication, fingerprint non-reversibility, same-project session reuse, independent concurrent projects, explicit close removal.
- **HTTP/security:** listener address is loopback, random port works, explicit collision fails deterministically, rejected non-loopback host / bad Host / bad Origin / missing credentials, consumed or expired bootstrap token, absent CORS headers, error serialization without stack/secret.
- **WebSocket:** token/credential and origin validation on upgrade, heartbeat handling, connection count, strictly increasing per-session `sequence`, broadcast to all authenticated pages, final-page close starts the timer, valid reconnect cancels it.
- **Shutdown:** simulated `SIGINT`/`SIGTERM`, explicit close, stop accepting new work, no forced interruption of an in-progress tracked P4 `apply`, final socket/server/registry cleanup. Isolate global process-signal listeners across tests.
- **Packaging:** assert a packed CLI archive contains the static entry and hashed assets, not merely `dist/main.*`; run the root CLI package verification route.

## Related Specs

- `.trellis/spec/backend/directory-structure.md` — browser-safe Core root, Node-only subpaths, CLI entrypoint and package import boundaries.
- `.trellis/spec/backend/error-handling.md` — expected errors use typed `Result`; serialize at CLI/API boundaries and do not expose stacks.
- `.trellis/spec/backend/logging-guidelines.md` — deterministic output; no ad-hoc core logging and never log tokens, skill contents, or unneeded absolute paths.
- `.trellis/spec/backend/quality-guidelines.md` — strict ESM TypeScript, quality commands, platform cleanup, and packaging verification.
- `.trellis/spec/backend/project-change-transaction-contract.md` — mandatory P4 API boundary, request/lock/transaction safety rules that P5 must preserve.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — Core/CLI/Web data-boundary review checklist.

## Caveats / Not Found

- No current server/session/security implementation exists; all P5 modules, route names, credential wire format, event payloads, and WebSocket library choice remain new decisions.
- No CLI tests exist. Current Vitest discovery supports colocated CLI tests, but they need to be created.
- No `ws`, browser-opening, or parser dependency is installed. Adding a WebSocket package changes `package.json`/lockfile and must be evaluated for Node 22, ESM types, packaging, and cross-platform CI compatibility.
- Static Web production assets are built separately and excluded from the packed CLI archive. This is the principal distribution blocker for "serve static Web resources"; either copy the Web build into the CLI package at build time or deliberately introduce a separately declared asset package.
- The P4 lock and idempotency cache are process-local. P5's registry can safely coordinate sessions only within this process; cross-process session reuse/locking is explicitly out of scope.
- P4 only supplies state transition helpers; it does not specify security policy, token TTL, heartbeat interval, event schema, route paths, graceful-drain timeout, or browser-launch mechanism. Those need to be made deterministic and tested in P5.
