# P10 Cross-Platform Integration and Acceptance Contract

## 1. Scope / Trigger

Apply this contract when changing browser-visible flows, protected local-session behavior, filesystem-link behavior, the P10 acceptance matrix, or `.github/workflows/ci.yml`. P10 validates the completed P0–P9 product on macOS, Linux, and Windows before P11 packaging/install work begins.

## 2. Signatures

The supported CI entrypoints are fixed root commands:

```text
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The GitHub Actions workflow exposes two matrix jobs:

```text
quality(matrix.os)      = ubuntu-latest | macos-latest | windows-latest
browser-e2e(matrix.os)  = ubuntu-latest | macos-latest | windows-latest
```

`browser-e2e` must install Chromium with:

```text
npx playwright install chromium
```

Do not use the Linux-specific `--with-deps` option in the cross-platform job.

## 3. Contracts

- Every AC-01 through AC-20 from the product design must map to an executable test or a repeatable native-host procedure in the active P10 task evidence.
- Browser E2E must exercise the protected browser API through narrow endpoint mocks, not broad `/api/**` interception, and must run on all three CI operating systems.
- The CI matrix is a regression gate for platform-neutral browser behavior. Native Windows Junction fallback remains an explicit native-host acceptance procedure because CI cannot guarantee a representative symlink-privilege policy.
- A test that validates untrusted skill content must assert that scripts/iframes do not execute or mount. A session-end test with staged selections must assert shutdown occurs without invoking project apply.
- P10 does not substitute package install/upgrade verification for application acceptance; those checks belong to P11.

## 4. Validation & Error Matrix

| Condition | Required outcome |
|---|---|
| A root quality command fails | Fix the regression; do not mark the acceptance item complete. `npm run lint` must bootstrap `@skillpin/core` so exported core subpaths resolve in a fresh CI checkout; repository text files must declare LF checkout policy in `.gitattributes`; Windows package helpers must invoke the `npm_execpath` CLI through Node instead of spawning `npm.cmd` with `execFileSync`; `npm run test:e2e` must bootstrap `@skillpin/core` before Vite resolves package exports. |
| A browser test passes only on one OS | Treat the result as incomplete; retain the full OS matrix. |
| Playwright installation fails on macOS/Windows | Use the portable Chromium installer command; do not add `--with-deps` globally. |
| Windows cannot create directory symlinks | Verify the eligible Junction fallback natively and record the actual manifest link type. |
| Markdown includes script/iframe payloads | No executable DOM node or script side effect may be observed. |
| Ending a staged session | The confirmation can close the session, but no `/api/project/apply` request may occur. |

## 5. Good / Base / Bad Cases

- **Good:** all CI matrices are green, the AC mapping points to precise tests/procedures, and native-only Windows evidence records the Junction result.
- **Base:** a single OS behaves differently; preserve the failure output and add a minimal regression test or documented native reproduction before changing production behavior.
- **Bad:** declaring P10 complete after Ubuntu-only browser checks, masking an OS-specific failure with a skipped test, or using package construction as evidence that feature flows work.

## 6. Tests Required

- Keep `tests/e2e/app.spec.ts` coverage for onboarding, source management, catalog detail safety, staged apply, and safe session termination.
- Keep Vitest integration coverage for session lifecycle, WebSocket security, source/catalog/project routes, stale revision, transaction rollback, and signal shutdown.
- Keep platform tests for path normalization, link inspection/removal, and eligible Windows Junction fallback.
- Update `.trellis/tasks/<active-task>/research/p10-acceptance-matrix.md` whenever an AC mapping or native validation procedure changes.
- Require successful `quality` and `browser-e2e` matrix runs before calling P10 complete; execute native Windows Junction validation if the hosted runner cannot prove the privilege fallback.

## 7. Wrong vs Correct

```yaml
# Wrong: browser behavior is only tested on Ubuntu and uses a Linux-only installer.
browser-e2e:
  runs-on: ubuntu-latest
  steps:
    - run: npx playwright install --with-deps chromium

# Correct: browser E2E is a three-platform gate with a portable installer.
browser-e2e:
  strategy:
    matrix:
      os: [ubuntu-latest, macos-latest, windows-latest]
  runs-on: ${{ matrix.os }}
  steps:
    - run: npx playwright install chromium
```
