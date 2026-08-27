# Fix skill source loading and font sizing

## Goal

Restore reliable loading/reloading of configured skill sources in the protected local session and make the SkillPin UI more comfortably readable without changing its existing visual theme or information architecture.

## What I already know

* The user reports that **重新加载技能源** fails with: `This request is not allowed for the current local session.`
* The same problem affects `GET /api/sources`, which backs the initial and manual source-list reload path.
* The local HTTP guard currently requires an exact `Origin` header for every API request.
* A real Chromium same-origin `fetch("/api/sources")` request does **not** send `Origin` on its `GET`, but does send `Sec-Fetch-Site: same-origin`. The server therefore returns `LOCAL_REQUEST_REJECTED` before credential validation; retrying repeats the same failure.
* The current visual-scale tokens are `--font-body: 13px`, `--font-ui: 13px`, and `--font-small: 12px`; several secondary labels are hard-coded as 10–12px.

## Requirements

* Fix the protected local API guard so authenticated, same-origin browser `GET` source-list requests are accepted when browsers omit the `Origin` header.
* Preserve defenses against non-loopback, wrong-host, and cross-origin requests. Do not expose credentials or add CORS permissions.
* Add regression coverage for a same-origin browser-shaped request without `Origin`, plus rejection of a cross-site-shaped request.
* Raise shared UI font tokens and undersized secondary text to a readable scale while preserving the Octopath HD-2D theme, semantic labels, and usable layouts.

## Acceptance Criteria

* [x] Opening or reloading the configured source list in Chromium no longer shows `无法加载技能源` with `This request is not allowed for the current local session.`
* [x] An authenticated API request without `Origin` is accepted only when it carries browser same-origin fetch metadata; cross-site metadata remains rejected.
* [x] Protected APIs still require valid credentials and return no CORS allow-origin header.
* [x] Primary UI text increases from 13px to a readable 15px baseline; secondary text is raised proportionally and controls remain visually balanced.
* [x] Existing unit/integration/E2E checks that cover the modified paths pass.

## Definition of Done

* [x] Tests added/updated where appropriate.
* [x] Formatting, lint, typecheck, build, package verification, and relevant tests pass.
* [x] Docs/spec notes updated for the browser request-guard and readable typography conventions.
* [x] No generated build output is committed.

## Technical Approach

1. Extend request-origin validation to recognize browser same-origin fetch metadata as an alternative only when an `Origin` header is legitimately absent; keep the exact-origin path and all loopback/host checks intact.
2. Add an integration regression test using the live local server and `Authorization` credential, with no `Origin` plus `Sec-Fetch-Site: same-origin`, then assert `cross-site` remains a 403 rejection.
3. Raise the stylesheet's central font tokens (`body`, `ui`, and `small`) and review hard-coded 10–12px secondary declarations so that readability improves consistently rather than only in one page.

## Decision (ADR-lite)

**Context**: Chromium omits `Origin` for same-origin `GET` fetches, but the server currently rejects every API request lacking it. The UI's retry button therefore cannot recover.

**Decision**: Treat `Sec-Fetch-Site: same-origin` as acceptable browser evidence only in the missing-`Origin` case, alongside the existing required loopback host and credential controls. Maintain rejection of missing/cross-site metadata for guarded browser API requests.

**Consequences**: Normal browser `GET` APIs work correctly. Cross-origin browser requests remain rejected, and direct non-browser callers continue to use the exact `Origin` route in current integration helpers.

## Out of Scope

* Redesigning the information architecture, theme, or navigation.
* Adding new source providers or changing source scan semantics.
* Browser zoom controls, user-configurable typography preferences, or a settings panel.

## Technical Notes

* Primary files expected: `packages/cli/src/security/request-guard.ts`, `tests/integration/local-api-security.test.ts`, and `packages/web/src/styles.css`.
* Related API handling: `packages/cli/src/server/http-server.ts` and `packages/web/src/features/sources/source-context.tsx`.
* Current browser client correctly uses the protected in-memory bearer credential. The defect is the server guard's incompatibility with standard same-origin `GET` request headers.

## Approval

* 2026-08-27: User approved the technical approach and implementation scope.

## Verification

* Targeted regression: `npm run test -- tests/integration/source-api.test.ts` — 4 tests passed.
* Full quality gate passed: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test` (86 tests), `npm run build`, `npm run test:e2e` (8 tests), `npm run pack`, and `npm run verify-package`.
