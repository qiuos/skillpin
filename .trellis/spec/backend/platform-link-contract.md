# Platform Link and Transaction Contract

## 1. Scope / Trigger

Use this contract whenever core code creates, inspects, renames, removes, or transactionally changes a managed directory link. It was established by P1 and applies to Node-side code only: these APIs are exported from `@skillpin/core/platform` and `@skillpin/core/changes`, never from the browser-safe package root.

The goal is safe local filesystem mutation. Do not substitute directory copying for a failed link operation.

## 2. Signatures

```ts
interface PlatformLinkAdapter {
  createDirectoryLink(input: CreateDirectoryLinkInput): Promise<Result<ManagedDirectoryLink, PlatformLinkError>>;
  inspectLink(linkPath: string): Promise<Result<LinkInspection, PlatformLinkError>>;
  renameLink(sourcePath: string, destinationPath: string): Promise<Result<void, PlatformLinkError>>;
  removeManagedLink(linkPath: string, expected: ExpectedManagedLink): Promise<Result<void, PlatformLinkError>>;
}

function executeLinkTransaction(
  request: LinkTransactionRequest,
): Promise<Result<LinkTransactionSuccess, FileTransactionError>>;
```

Implement the Node adapter in `packages/core/src/platform/node-platform-link-adapter.ts`. Export platform APIs through `packages/core/src/platform/index.ts` and transaction APIs through `packages/core/src/changes/index.ts` so `packages/core/src/index.ts` remains browser-safe.

## 3. Contracts

- `createDirectoryLink` resolves `targetPath` to an existing canonical directory before mutation and returns the actual `linkType`, canonical `targetPath`, and SHA-256 `targetFingerprint`.
- macOS and Linux create a directory symbolic link. On Windows, a `dir` symlink may fall back to `junction` only after `EPERM` or `EACCES`; every other error fails directly.
- `inspectLink` uses `lstat` first. It returns `kind: "link"` with `dangling: true` for a link whose target cannot resolve; it never follows a link before classifying it.
- `removeManagedLink` is intentionally strict: it removes only a non-dangling link whose type, canonical target path, and fingerprint all match the expected managed record. Directories, files, unknown links, and mismatches are rejected.
- `executeLinkTransaction` uses hidden sibling temporary/backup link names and sibling manifest temporary/backup files. It writes the manifest temporary file with `flush: true`, then renames it in the same directory.
- Failure injection is supported at forward mutation stages through `onBeforeStep`. On a forward-stage error the prototype reverses completed mutations. A post-commit backup-cleanup error returns `TRANSACTION_RECOVERY_REQUIRED` with manual recovery paths instead of pretending the old state was restored.

## 4. Validation & Error Matrix

| Condition | Required result | Code |
| --- | --- | --- |
| Target does not resolve | No link mutation | `TARGET_NOT_FOUND` |
| Target exists but is not a directory | No link mutation | `TARGET_NOT_DIRECTORY` |
| Destination already exists | No overwrite | `LINK_PATH_CONFLICT` |
| Windows symlink permission/policy error | Try one Junction fallback | `JUNCTION_FALLBACK_FAILED` only if fallback fails |
| Other symlink creation failure | No Junction or copy fallback | `LINK_CREATION_FAILED` |
| Existing path is not the expected managed link | No rename or delete | `MANAGED_LINK_MISMATCH` |
| Forward transaction stage fails and rollback succeeds | Original link/manifest state restored | `TRANSACTION_FAILED` |
| Backup cleanup or rollback cannot be completed | Return paths for manual diagnosis | `TRANSACTION_RECOVERY_REQUIRED` |

`PlatformLinkError` and `FileTransactionError` extend `SkillPinError`, preserving stable error codes for future CLI and local-service boundaries.

## 5. Good / Base / Bad Cases

**Good — safe replace:** inspect the current link against its persisted `ExpectedManagedLink`, rename it to a sibling backup, create and verify a temporary replacement, promote it, atomically commit the manifest, then discard backups.

**Base — dangling link:** return a `LinkInspection` with `kind: "link"`, `dangling: true`, and null canonical target/fingerprint. Do not delete it automatically.

**Bad — guessed deletion:** call `rm` on `.agents/skills/<name>` because it looks like a directory or because `readlink` returned a path. This can delete user-owned content or an unknown link and is forbidden.

## 6. Tests Required

Add or update tests under `tests/platform/` for every contract change:

- `path-normalization.test.ts`: canonical path resolution, directory-only validation, spaces/non-ASCII paths, and deterministic fingerprint behavior including Windows case/separator normalization.
- `link-adapter.test.ts`: create, inspect, rename, safe delete, dangling classification, rejection of a replaced ordinary directory, and simulated Windows Junction fallback/no-fallback behavior.
- `file-transaction.test.ts`: add/remove/replace success plus failure injection before every reversible forward mutation; assert manifest contents, original link target, and absence of `.skillpin-` artifacts after rollback.

Run `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`, and `npm run build`. CI must execute the platform test suite in its existing Ubuntu/macOS/Windows matrix.

## 7. Wrong vs Correct

```ts
// Wrong: a failed symlink silently creates a diverging directory copy.
await copyDirectory(targetPath, linkPath);

// Correct: only the documented Windows permission fallback is allowed.
const created = await adapter.createDirectoryLink({ linkPath, targetPath });
if (!created.ok) return created;
```

The same rule applies to cleanup: an unverified path is never removed merely to make a transaction appear successful.
