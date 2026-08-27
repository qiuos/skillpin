# P9 Project Change Workflow Foundation

## 1. Scope / Trigger

This contract applies when implementing direct per-skill project actions in `packages/web/src/features/catalog/skills-workbench-page.tsx` with project methods on `LocalApiClient`.

P9 begins only when a user clicks an explicit catalog-row `启用` or `移除` action. Browsing catalog groups, choosing a candidate, and reading Markdown remain read-only P8 behavior.

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

The direct UI creates exactly one selection per action:

```ts
type DirectProjectSelection = readonly [LocalProjectSelectionInput];
// { linkName, candidateId: string } enables/replaces the chosen candidate
// { linkName, candidateId: null } removes the managed project link
```

## 3. Contracts

- Obtain the client through `useLocalApiClient()`. Feature code must not use direct `fetch`, browser storage, or bearer credentials.
- A skill-row `启用` action uses the selected candidate when that group is being inspected; otherwise it uses the group's first stable candidate. `移除` is exposed only when the project snapshot marks that link as `managed`.
- A row click remains inspection-only. Only a row-level action can mutate a project.
- The browser must not keep staged selections, show a batch command bar, or open a confirmation dialog for skills-workbench actions.
- A direct action first calls `projectPlan()` with its one selection. Apply only when the plan has no blockers and at least one change; then call `applyProjectChanges()` with that same selection, the plan's `baseRevision`, and a fresh `crypto.randomUUID()` request ID.
- During a direct action, disable all catalog row action buttons to prevent concurrent plans or applies. The active row may show its `启用中…` or `移除中…` state.
- On success, render the snapshot returned by apply. On plan/apply failure, surface the local API/recovery message and refresh `project()` so recovery diagnostics are current.
- Project snapshot, plan, and apply responses are runtime-validated in `LocalApiClient`; invalid payloads are `LOCAL_API_INVALID_RESPONSE`, never partial UI state.

## 4. Validation & Error Matrix

| State | Required UI behavior |
|---|---|
| Initial project inspection unavailable | Show a project error without disabling catalog inspection. |
| Click direct enable/remove | Send exactly one single-selection plan request; do not create browser staging state. |
| Server plan has blockers or no changes | Show the message, do not call apply, and do not open a dialog. |
| Plan is valid | Send one apply request using its base revision and a new request ID. |
| `REVISION_CONFLICT` / `PROJECT_APPLY_IN_PROGRESS` | Show actionable retry wording, refresh snapshot, and do not automatically repeat the mutation. |
| `CATALOG_CANDIDATE_NOT_FOUND` | Show the API message and leave inspection available for a new choice. |
| `TRANSACTION_FAILED` with `manual-recovery` | Tell the user manual recovery review is required and display refreshed recovery diagnostics. |
| Apply success | Update the project state from the returned snapshot; list action/status changes immediately. |

## 5. Good / Base / Bad Cases

- **Good:** a user clicks `移除` on one managed link; the UI performs plan → apply once, without a confirmation dialog, and renders `未启用` from the returned snapshot.
- **Base:** a user inspects a competing candidate, then clicks `启用`; exactly that selected candidate is sent in the one-item selection.
- **Bad:** treating a row-selection click as a mutation, batching multiple link names, or retaining stale staged state.
- **Bad:** applying without a current server plan, calling `fetch` directly, or allowing two concurrent direct actions.

## 6. Tests Required

- Local API client tests assert authenticated project endpoints and strict decoding of snapshots/plans/applies.
- Playwright mocks `/api/project`, `/api/project/plan`, and `/api/project/apply`; record plan/apply counts.
- Cover direct enable and managed-link removal. Each must assert one plan request, one apply request, changed row status/action, no batch command bar, and no confirmation dialog.
- Assert plan blockers/errors do not call apply.
- Retain integration coverage for server-side candidate resolution, stale revisions, request-id idempotency, and ignored browser target paths.

## 7. Wrong vs Correct

```tsx
// Wrong: browser-local staging and a later batch confirmation.
setStaged({ [group.linkName]: null });

// Correct: plan and apply exactly one explicit row action.
applyDirectChange(group, true);
```
