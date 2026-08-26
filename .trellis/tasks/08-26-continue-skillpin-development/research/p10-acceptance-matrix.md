# P10 Acceptance Matrix and Platform Evidence Plan

**Authoritative source:** `SkillPin产品技术一体化方案.md` §14.1 (AC-01–AC-20), read on August 26, 2026.

P10 validates the completed P0–P9 product as an integrated whole. The tests below are the executable evidence; the platform instructions identify cases that require a native host because their OS capability cannot be truthfully simulated on another operating system.

| AC | Automated evidence | P10 evidence status | Native/manual supplement |
|---|---|---|---|
| AC-01 | `tests/e2e/app.spec.ts` — `onboards a first source without showing an empty workspace` | Local Chromium passed | Run the same onboarding flow through the three-OS CI browser matrix. |
| AC-02 | `tests/e2e/app.spec.ts` — source onboarding/management; `tests/integration/source-api.test.ts`; `tests/integration/skill-scanning.test.ts` | Local unit/integration/E2E passed | Verify a real readable source with spaces and Chinese path segments on each OS. |
| AC-03 | `tests/e2e/app.spec.ts` — searchable catalog; `tests/integration/source-api.test.ts`; `tests/integration/skill-scanning.test.ts` | Local unit/integration/E2E passed | Exercise source filtering in the OS browser job. |
| AC-04 | `packages/core/src/catalog/catalog.test.ts`; `tests/e2e/app.spec.ts` — staged review/apply | Local unit/E2E passed | Add a real duplicate-name source pair while performing the platform smoke flow. |
| AC-05 | `packages/core/src/project/project-p4.test.ts`; `tests/integration/project-api.test.ts` | Local unit/integration passed | Inspect created `.agents/skills` and `.agents/skillpin.json` in platform smoke flow. |
| AC-06 | `packages/core/src/project/project-p4.test.ts`; `tests/integration/project-api.test.ts` | Local unit/integration passed | Preserve a manually created unknown directory beside a managed link. |
| AC-07 | `packages/core/src/project/project-p4.test.ts`; `tests/integration/project-api.test.ts` | Local unit/integration passed | Confirm replacement and manifest revision in platform smoke flow. |
| AC-08 | `packages/core/src/project/project-p4.test.ts` — unknown content protection | Local unit passed | Use a real directory or unowned link named like a candidate. |
| AC-09 | `packages/core/src/project/project-p4.test.ts`; `tests/integration/project-api.test.ts` | Local unit/integration passed | Mutate the project between review and apply in platform smoke flow. |
| AC-10 | `packages/core/src/project/project-p4.test.ts` — injectable failure rollback phases | Local unit passed | Review `ROLLBACK_INCOMPLETE` recovery messaging when failure injection is enabled. |
| AC-11 | `tests/platform/link-adapter.test.ts` — eligible Windows Junction fallback | Automated behavior passed with injected Windows permission failure | **Windows native required:** deny directory-symlink privilege while Junction remains allowed, apply a candidate, then verify manifest `linkType: "junction"` and target access. |
| AC-12 | `tests/integration/session-lifecycle.test.ts`; `tests/integration/local-api-security.test.ts` | Local integration passed | Close the final browser page and verify 60-second shutdown on each OS. |
| AC-13 | `tests/integration/session-lifecycle.test.ts`; `tests/integration/local-api-security.test.ts` — real WebSocket reconnect | Local integration passed | Reopen/reinvoke before 60 seconds during platform smoke flow. |
| AC-14 | `tests/e2e/app.spec.ts` — `confirms ending a session with staged changes without applying them` | Local Chromium passed | Confirm the manifest remains untouched after the explicit end action. |
| AC-15 | `tests/integration/session-lifecycle.test.ts` — independent projects and session registry | Local integration passed | Start two project directories in separate terminals. |
| AC-16 | `tests/integration/source-api.test.ts` — source removal impact; project inspection tests | Local integration/unit passed | Remove source configuration while retaining a verified project link. |
| AC-17 | `tests/integration/local-api-security.test.ts`; `tests/integration/project-api.test.ts` | Local integration passed | No manual substitute required; rerun on all CI OSs. |
| AC-18 | `tests/e2e/app.spec.ts` — explicit safe detail and `does not execute untrusted Markdown from a skill detail` | Local Chromium passed | Open a real `SKILL.md` containing script, iframe, event attribute, and dangerous URI payloads. |
| AC-19 | `packages/core/src/persistence/persistence.test.ts`; `packages/core/src/project/project-p4.test.ts` | Local unit passed | Preserve a corrupt config/manifest fixture and confirm original-byte retention. |
| AC-20 | `tests/integration/session-lifecycle.test.ts` — simulated SIGTERM and active apply close | Local integration passed | Send Ctrl+C to an idle session and to an apply operation on each OS. |

## CI Discovery: Fresh-Checkout Lint Bootstrap

The first remote P10 CI run on August 26, 2026 reproduced two fresh-checkout quality defects. Ubuntu and macOS failed `npm run lint` before type-checking because `eslint-plugin-import` resolved CLI imports of `@skillpin/core/*` through the core package exports, but a fresh checkout had no `packages/core/dist/` output yet. The root `npm run lint` command now builds `@skillpin/core` before invoking ESLint, making the documented lint entrypoint self-contained. Windows failed `npm run format:check` because checkout line-ending conversion had no repository policy; `.gitattributes` now normalizes detected text to LF on all platforms. Both corrections must be rerun through the full three-OS CI matrix.

## CI Evidence

`.github/workflows/ci.yml` runs `quality` and `browser-e2e` on `ubuntu-latest`, `macos-latest`, and `windows-latest`. The browser job installs Chromium with Playwright's cross-platform browser installer and executes the Playwright suite. This makes the full browser core flow a required three-platform CI result rather than an Ubuntu-only signal.

## Native Platform Smoke Procedure

Use Node.js 22 or later on a clean macOS, Linux, or Windows host:

1. Check out the P10 commit and run `npm ci`, `npm run build`, `npm test`, and `npm run test:e2e`.
2. Create an empty project directory and a skill-source directory whose absolute path includes both a space and Chinese characters. Add at least two skills, with a duplicate `linkName` in a second source.
3. Run `skillpin --no-open <project>` (or use the package's current development entrypoint), complete source setup, search/filter catalog candidates, stage an add, apply it, then stage and apply a replacement.
4. Add an unknown `.agents/skills/<linkName>` directory and verify that a conflicting apply is blocked rather than overwritten. Edit the project between plan and apply and verify stale review recovery.
5. Connect two browser pages, close both, reconnect within the 60-second grace period, then close the final page and observe shutdown. Start a second project session and verify separate ports/manifests.
6. Corrupt a copy of the user config and project manifest; verify the originals remain unchanged and the UI exposes recovery guidance. Send Ctrl+C while idle and during a controlled apply.
7. On Windows, repeat an add with directory symlink permission unavailable but Junction creation permitted. Verify the actual manifest link type and skill target access.

## Current Local Result

On macOS, August 26, 2026: format check, lint, typecheck, unit/integration suite (84 tests), build, and the 7-test Playwright suite pass after the P10 additions. Remote macOS/Linux/Windows matrix evidence and the Windows-native Junction privilege procedure remain required before P10 can be marked complete.
