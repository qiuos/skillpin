# P9 Project Change Workflow Foundation

## 1. Scope / Trigger

This contract applies when extending the P8 skills workbench with staged project changes in `packages/web/src/features/catalog/skills-workbench-page.tsx` and project methods on `LocalApiClient`.

P9 begins only after a user explicitly stages a candidate or managed-link removal. Browsing catalog groups, choosing the default candidate, reading Markdown, and copying paths remain read-only P8 behavior.

## 2. Signatures

```ts
LocalApiClient.project(): Promise<LocalProjectSnapshot>
LocalApiClient.projectPlan(
  selections: readonly LocalProjectSelectionInput[],
): Promise<LocalProjectPlanResponse>
LocalApiClient.applyProjectChanges(
  input: LocalProjectApplyInput,
): Promise<LocalProjectApplyResponse>
```

The staged UI representation is intentionally browser-local:

```ts
type StagedProjectSelections = Record<string, string | null>;
// key: project link name
// value: catalog candidate ID to add/replace, or null to remove
```

## 3. Contracts

- Obtain the client through `useLocalApiClient()`. Feature code must not use direct `fetch`, browser storage, or bearer credentials.
- Stage a candidate only through an explicit `启用` action. Candidate comparison and the P8 selected/default candidate do not stage anything automatically.
- Allow an explicit `移除` action only for project links whose snapshot state is `managed`. Keep removal intent as `null`; `撤销选择` removes the map key.
- Show an always-visible bottom command bar. It reports zero selections and disables clear/apply when staging is empty; once staged, it reports the count and its action sends current candidate IDs/link names to `projectPlan()`.
- The server-computed plan remains a safety boundary, not a separate user review screen. If the plan has blockers or no changes, retain staging and render an actionable message without opening confirmation.
- Apply uses one confirmation dialog after a current, unblocked plan is generated. Its direct Chinese copy names the enable/remove counts and its one explicit action creates a fresh `crypto.randomUUID()` request ID and sends the planned base revision with current staged intents.
- On successful apply, use the returned snapshot, clear staging/plan state, and close the confirmation dialog. On failure, retain staging, surface the local API message/recovery action, and refresh project inspection so any recovery diagnostics are visible.
- Project snapshot, plan, and apply responses are runtime-validated in `LocalApiClient`; invalid payloads are `LOCAL_API_INVALID_RESPONSE`, not partial UI state.

## 4. Validation & Error Matrix

| State | Required UI behavior |
|---|---|
| Initial project inspection unavailable | Show a project error without disabling catalog comparison |
| No staged intents | Keep the command bar visible with a zero count and disabled apply/clear actions |
| Server plan has blockers | Render blocker messages, retain staging, and do not open confirmation |
| `REVISION_CONFLICT` / `PROJECT_APPLY_IN_PROGRESS` | Retain stages, show actionable retry/selection wording; do not repeat mutation automatically |
| `CATALOG_CANDIDATE_NOT_FOUND` | Retain stages and return the user to selection |
| `TRANSACTION_FAILED` with `manual-recovery` | Tell the user manual recovery review is required and display refreshed recovery diagnostics |
| Apply success | Clear staged map, clear plan, close confirmation, and render the returned project snapshot |

## 5. Good / Base / Bad Cases

- **Good:** a user compares candidates, explicitly stages one with `启用`, receives one confirmation after an unblocked current plan, then applies exactly once.
- **Base:** a managed project link can be staged with `移除` and reverted with `撤销选择` without changing the filesystem until confirmation.
- **Bad:** treating the selected catalog candidate as a project selection on page load or group switch.
- **Bad:** exposing a filesystem mutation without a current server plan and final confirmation, calling `fetch` directly, or retaining a stale plan as if it were safe after an API conflict.

## 6. Tests Required

- `LocalApiClient` tests assert authenticated project endpoints and strict decoding of snapshots/plans/applies.
- Playwright mocks `/api/project`, `/api/project/plan`, and `/api/project/apply`; cover enable and managed-link removal through stage → one confirmation → apply, and assert no review dialog is shown.
- Keep the P8 E2E assertion that comparison is not automatic mutation, updated to explain explicit enable/remove staging.
- Retain integration coverage for server-side candidate resolution, stale revisions, request-id idempotency, and ignored browser target paths.

## 7. Wrong vs Correct

```tsx
// Wrong: candidate viewing silently opts it into mutation.
useEffect(() => setStaged({ [selectedCandidate.linkName]: selectedCandidate.id }), [
  selectedCandidate,
]);

// Correct: only an explicit action changes staged intent.
<Button onClick={() => stageCandidate(candidate)}>启用</Button>
```
