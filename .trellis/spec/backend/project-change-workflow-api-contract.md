# P9 Protected Project Change Workflow Contract

## 1. Scope / Trigger

This contract applies to the P9 browser-facing project inspection, plan, and apply APIs in `packages/cli/src/server/routes/project-routes.ts`, their session composition, and the browser-safe API types in `@skillpin/core/api`.

It extends P4 without replacing it. Route code must use `ProjectSnapshotService`, `planProjectChanges`, and `ProjectChangeService` rather than implementing filesystem inspection, link planning, locking, idempotency, or transactions itself. The web bundle must never import Node-only `@skillpin/core/project` or `@skillpin/core/changes` modules.

## 2. Signatures

```ts
GET  /api/project
  // -> LocalProjectSnapshot

POST /api/project/plan
  // body: { selections: LocalProjectSelectionInput[] }
  // -> LocalProjectPlanResponse

POST /api/project/apply
  // body: LocalProjectApplyInput
  // -> LocalProjectApplyResponse

SourceRuntime.projectSelections(selections)
  // -> Result<ProjectSelection[], CoreError>
```

All three routes are registered as normal `LocalHttpServer` API routes, so P5 Host/Origin/bearer-credential guards apply before their handlers execute.

## 3. Contracts

- `LocalProjectSelectionInput` contains only `{ linkName, candidateId }`; `candidateId: null` is a removal intention. A browser must not supply an authoritative target directory, source ID, fingerprint, or platform link type.
- `SourceRuntime.projectSelections()` initializes the current session catalog and resolves every submitted candidate ID from that live snapshot. It builds the Node-only P4 `ProjectSelection` values with canonical target data. A request may contain multiple related selections (for example, a directory skill-group action); every selection is independently resolved before P4 receives the batch, and a missing ID returns `CATALOG_CANDIDATE_NOT_FOUND` with `review-state` recovery.
- `GET /api/project` calls `snapshotService.inspect()` and returns only `manifestRevision`, link-name/state/source-state summaries, and recovery diagnostics. It does not return managed targets or manifest entries.
- `POST /api/project/plan` reads at most 32 KiB of JSON, resolves the submitted IDs, inspects a fresh project snapshot, and calls the pure P4 `planProjectChanges()`. Planning has no filesystem mutation.
- `POST /api/project/apply` validates the revision/request ID/selections envelope, resolves IDs fresh, then calls `ManagedSession.runProjectOperation(() => changeService.apply(...))`. P4 remains the only owner of revision validation, process locking, successful-request idempotency, rollback, and recovery diagnostics.
- P9 response payloads use `LocalProjectSnapshot`, `LocalProjectPlanResponse`, and `LocalProjectApplyResponse` from the browser-safe core API entrypoint. API error recovery actions include `manual-recovery` in addition to P5's `open-session`, `retry`, and `review-state` actions.

## 4. Validation & Error Matrix

| Condition | Required outcome |
|---|---|
| No valid P5 credential/origin/host | Existing P5 auth response; handler must not run |
| Malformed or oversized plan/apply JSON | `400 API_REQUEST_INVALID`, `review-state` |
| Any selection candidate no longer exists in session catalog | `422 CATALOG_CANDIDATE_NOT_FOUND`, `review-state`; no partial selection batch is passed to P4 |
| Candidate link name does not match the submitted link name | P4 plan blocker `INVALID_CANDIDATE`; never select a target by path |
| Unknown occupied path or manifest mismatch | P4 plan blocker, no apply button path |
| Base revision is stale | `422 REVISION_CONFLICT`, `retry`, return the user to review |
| Concurrent writer | `422 PROJECT_APPLY_IN_PROGRESS`, `retry` |
| Transaction rollback cannot be proven | `422 TRANSACTION_FAILED`, `manual-recovery`; preserve diagnostics for inspection |

## 5. Good / Base / Bad Cases

- **Good:** a browser stages a catalog candidate ID for `review`, receives an `add` plan at revision `0`, explicitly applies with a safe request ID, and receives a revision `1` snapshot.
- **Base:** a browser submits two directory-group member selections; both are resolved from the current session catalog before one P4 plan/apply transaction. Repeating the same successful `requestId` returns P4's cached `idempotent: true` result and makes no second filesystem change.
- **Bad:** a browser submits `targetPath: "/tmp/other"` alongside a valid candidate ID. Route parsing ignores that field; the resulting link targets the current catalog candidate resolved by `SourceRuntime`.
- **Bad:** the user reviews revision `0`, another operation changes the project, then applies revision `0`. P4 returns `REVISION_CONFLICT`; do not retry with a rewritten revision automatically.

## 6. Tests Required

- Local API client tests validate authenticated project GET/plan/apply paths, request bodies, valid response decoding, and malformed project payload rejection.
- Integration tests start a P5 session, prove unauthenticated P9 access is rejected, add a real source, obtain candidate IDs from catalog data, plan/apply one and multiple selections through P4, assert real linked target ownership, repeat for idempotency, and verify stale/missing-candidate failures.
- The integration test must include an ignored browser-supplied target-path field to protect the server-authority boundary.
- P4's existing filesystem transaction tests remain responsible for add/replace/remove mechanics and recovery failure injection.

## 7. Wrong vs Correct

```ts
// Wrong: trust browser-provided filesystem authority.
changeService.apply({
  ...input,
  selections: input.selections.map((selection) => ({
    candidate: { targetPath: selection.targetPath },
    linkName: selection.linkName,
  })),
});

// Correct: resolve the current session catalog candidate before P4 receives it.
const selections = await session.sourceRuntime.projectSelections(input.selections);
return session.runProjectOperation(() =>
  session.projectServices.changeService.apply({
    baseRevision: input.baseRevision,
    requestId: input.requestId,
    selections: selections.value,
  }),
);
```
