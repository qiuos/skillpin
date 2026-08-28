# P9 Project Change Workflow Foundation

## 1. Scope / Trigger

This contract applies when implementing explicit single-skill or directory-skill-group project actions in `packages/web/src/features/catalog/skills-workbench-page.tsx` with project methods on `LocalApiClient`.

P9 begins only when a user clicks an explicit catalog-row, dialog-member, or dialog-group `启用` / `移除` action. Browsing catalog items, choosing a candidate, opening a group dialog, and reading Markdown remain read-only P8 behavior.

## 2. Signatures

```ts
LocalApiClient.project(): Promise<LocalProjectSnapshot>
LocalApiClient.projectPlan(
  selections: readonly LocalProjectSelectionInput[],
): Promise<LocalProjectPlanResponse>
LocalApiClient.applyProjectChanges(
  input: LocalProjectApplyInput,
): Promise<LocalProjectApplyResponse>

type ExplicitProjectSelections = readonly LocalProjectSelectionInput[];
// A single-skill/member action has exactly one selection.
// A directory-group action has one selection per member skill.
```

## 3. Contracts

- Obtain the client through `useLocalApiClient()`. Feature code must not use direct `fetch`, browser storage, or bearer credentials.
- A skill or dialog-member `启用` action uses the selected candidate when that group is currently inspected; otherwise it uses the group's first stable candidate. `移除` sends `{ linkName, candidateId: null }` only when the project snapshot marks that link as `managed`.
- A group action derives all selections immediately from the displayed members: enable/replaces every disabled member, or removes every managed member. It sends all derived selections in one plan/apply transaction; do not retain a browser-side staging queue.
- Every explicit action first calls `projectPlan(selections)`. Apply only when the plan has no blockers and has at least one change; then call `applyProjectChanges()` with the same selections, the plan's `baseRevision`, and a fresh `crypto.randomUUID()` request ID. A no-change plan refreshes `project()` and skips apply.
- Row/group opening remains inspection-only. The browser must not show a batch command bar or confirmation dialog for skills-workbench actions.
- During any action, disable all catalog, dialog-member, and group buttons to prevent concurrent plans or applies. The active action may show its `启用中…` or `移除中…` state.
- On apply success, render the returned snapshot. On plan/apply failure, surface the local API/recovery message and refresh `project()` so recovery diagnostics are current.
- Project snapshot, plan, and apply responses are runtime-validated in `LocalApiClient`; invalid payloads are `LOCAL_API_INVALID_RESPONSE`, never partial UI state.

## 4. Validation & Error Matrix

| State | Required UI behavior |
|---|---|
| Initial project inspection unavailable | Show a project error without disabling catalog inspection. |
| Click direct enable/remove | Send one plan containing one selection; do not create browser staging state. |
| Click directory-group action | Send one plan containing the relevant selection for every displayed member. |
| Server plan has blockers | Show the message, do not call apply, and do not open a confirmation dialog. |
| Server plan has no changes | Skip apply and refresh the project snapshot. |
| Plan is valid | Send one apply request using its base revision and a new request ID. |
| `REVISION_CONFLICT` / `PROJECT_APPLY_IN_PROGRESS` | Show actionable retry wording, refresh snapshot, and do not automatically repeat the mutation. |
| `CATALOG_CANDIDATE_NOT_FOUND` | Show the API message and leave inspection available for a new choice. |
| `TRANSACTION_FAILED` with `manual-recovery` | Tell the user manual recovery review is required and display refreshed recovery diagnostics. |
| Apply success | Update project state from the returned snapshot; list and dialog action/status copy changes immediately. |

## 5. Good / Base / Bad Cases

- **Good:** a user clicks a group-level `启用剩余 2 项`; the UI plans and applies exactly two selections in one request pair, then renders `2 / 2 已启用`.
- **Base:** a user opens the group dialog and removes one managed member; exactly that one selection is planned/applied and the group count becomes `1 / 2 已启用`.
- **Bad:** treating a row/dialog opening click as a mutation, persisting a staged selection queue, or allowing two concurrent actions.
- **Bad:** applying without a current server plan or calling `fetch` directly.

## 6. Tests Required

- Local API client tests assert authenticated project endpoints and strict decoding of snapshots/plans/applies.
- Playwright mocks `/api/project`, `/api/project/plan`, and `/api/project/apply`; record request counts and each plan's selection count.
- Cover direct enable/removal plus group enable and member removal. Assert one plan/apply pair per explicit operation, group count refresh, no batch command bar/confirmation dialog, and Escape focus return from the group dialog.
- Assert plan blockers/errors do not call apply.
- Retain integration coverage for server-side candidate resolution, stale revisions, request-id idempotency, and ignored browser target paths.

## 7. Wrong vs Correct

```tsx
// Wrong: persist an implicit staging queue and apply it later.
setStaged((current) => [...current, selection]);

// Correct: derive the explicit group selections and immediately plan → apply.
applySelections(group.skills.map(selectionForGroup), `group:${group.id}`);
```
