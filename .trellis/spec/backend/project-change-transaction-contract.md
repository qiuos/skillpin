# P4 Project State, Change Planning, and Transaction Contract

## 1. Scope / Trigger

This contract applies to Node-only project inspection and mutation code in `packages/core/src/project/` and `packages/core/src/changes/`. It is the required boundary for P5 API/session code that reads or changes a project's `.agents/skillpin.json` and `.agents/skills` directory.

Use `@skillpin/core/project` and `@skillpin/core/changes`; never expose these modules from the browser-safe `@skillpin/core` root. The P4 services consume source-catalog candidate data but do not invoke scanning/configuration internals.

## 2. Signatures

```ts
new ProjectSnapshotService({ adapter, projectDirectory, sources? }).inspect()
  // -> Promise<Result<ProjectSnapshot, CoreError>>

planProjectChanges(snapshot, selections)
  // -> ChangePlan

validateChangePlan(snapshot, baseRevision, requestId, plan)
  // -> Result<void, CoreError>

new ProjectChangeService({ adapter, snapshotService, lock? }).apply({
  baseRevision,
  requestId,
  selections,
})
  // -> Promise<Result<ApplyProjectChangesSuccess, CoreError>>
```

For filesystem fault-injection tests only, call `applyLinkTransaction()` with `onBeforeStep`. Injectable steps are `stage-links`, `backup-links`, `promote-links`, `write-manifest-temporary`, `backup-manifest`, `commit-manifest`, and `discard-backups`.

## 3. Contracts

- `ProjectSnapshotService` is read-only: it must not create `.agents`, `.agents/skills`, a manifest, or delete transaction residue.
- A manifest entry is **managed** only when the live path is a non-dangling link whose actual type and target fingerprint equal the manifest. Never infer management from a normal directory.
- Unrecorded paths are reported as `unknown-directory`, `unknown-file`, `unknown-link`, or `unknown-other`; any non-missing unknown state blocks a write plan.
- Missing/dangling/mismatched manifest entries are not safe to mutate and block a write plan. `sourceState` is `available`, `disabled`, or `unconfigured` independently of the live-link state.
- Candidate `linkName` values use P3 portable-link validation, target paths must be absolute, and skill relative paths must not be absolute, empty, or contain `.` / `..` segments.
- `requestId` is a portable filename segment: `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`. It is part of project-local temporary/backup names and is also the process-local idempotency key.
- `ProjectChangeService` takes the non-queuing `ProjectLock`, re-inspects immediately before planning/applying, and caches only successful request results per normalized lexical project path and request ID.
- A successful non-empty change set increments the persisted manifest revision exactly once. A no-op request is cached but does not create a manifest or increment revision.
- P4 transaction residue is diagnosed by name and returned as `recoveryDiagnostics`; its `safeToDelete` flag is always `false`. Do not delete it automatically.

## 4. Validation & Error Matrix

| Condition | Required outcome |
|---|---|
| Target project does not exist or is not a directory | `PROJECT_NOT_DIRECTORY`, `choose-directory` |
| `.agents` or `.agents/skills` is a file, symlink, or other non-directory | `PROJECT_STRUCTURE_CONFLICT`, no writes |
| Base revision differs from fresh snapshot | `REVISION_CONFLICT`, retryable, `review-state` |
| Request ID is unsafe/empty | `CHANGESET_INVALID`, no temporary path constructed |
| Duplicate selection, invalid candidate, unknown occupancy, manifest mismatch | `PROJECT_STATE_CONFLICT`, `review-state` |
| Another in-process writer holds the project lock | `PROJECT_APPLY_IN_PROGRESS`, retryable, `retry` |
| Any transaction phase fails and rollback succeeds | `TRANSACTION_FAILED` with `transactionStep`, recovery paths, and `review-state` |
| Rollback cannot prove/remove/restore a path | `TRANSACTION_FAILED` with recovery paths and `manual-recovery` |

## 5. Good / Base / Bad Cases

- **Good:** an empty project selects a readable candidate. Stage a temporary link, commit the replacement manifest, remove only transaction-created backups, and return revision `1`.
- **Base:** the caller repeats the same successful request ID. Return its original result with `idempotent: true`; do not touch the filesystem or increment revision.
- **Bad:** a user-created `.agents/skills/code-review` directory exists without a matching manifest entry. Surface `unknown-directory`; the planner must block rather than replace it.
- **Bad:** a manifest says `symlink` but the live path is a different target/link type. Surface `manifest-mismatch`; do not remove it.
- **Bad:** a transaction leaves `.name.skillpin-tmp-*` or `.name.skillpin-backup-*`. Show a diagnostic for manual review; never assume it is safe to delete.

## 6. Tests Required

- Real filesystem add, replace, and remove tests using `NodePlatformLinkAdapter`.
- Snapshot tests for unknown directory/file/link and mismatched/dangling managed entries.
- Planner tests for case-folded duplicate link names, unsafe candidates, and unknown occupancy blockers.
- Apply tests for stale revision, repeated successful request ID, no-op request, and a contended `ProjectLock` lease.
- A replacement fault-injection test for every `LinkTransactionStep`, asserting the original verified link and manifest revision remain after rollback.
- Residue diagnostics tests asserting no automatic cleanup.

## 7. Wrong vs Correct

**Wrong — treat any directory as managed and remove it:**

```ts
if (entry.isDirectory()) await rm(linkPath, { recursive: true });
```

**Correct — require exact link verification and let the adapter remove it:**

```ts
if (snapshot.state !== "managed" || snapshot.verifiedLink === null) {
  return err(new CoreError("The managed link does not match the project manifest.", "PROJECT_STATE_CONFLICT"));
}
await adapter.removeManagedLink(linkPath, snapshot.verifiedLink);
```

**Wrong — create a temporary name from arbitrary client input:**

```ts
const temporary = `${linkPath}.${requestId}`;
```

**Correct — validate the request ID before it is used in a project-local temporary/backup filename:**

```ts
if (!isSafeChangeRequestId(requestId)) {
  return err(new CoreError("A change request requires a safe request id.", "CHANGESET_INVALID"));
}
```
