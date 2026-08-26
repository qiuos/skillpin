# P2 JSON Persistence Contract

## 1. Scope / Trigger

P2 introduced Node-only persistence for the user configuration and project manifest. The runtime schema, atomic file operations, and repositories live in `packages/core`, but they are exported only through `@skillpin/core/persistence`; the browser-safe `@skillpin/core` root must remain free of Node filesystem imports.

This contract applies to all future code that loads or writes either document. P3 owns configuration-location discovery and P4 owns project-state inspection; neither may bypass these repositories to parse or overwrite the JSON files directly.

## 2. Signatures

```ts
class UserConfigRepository {
  constructor(options: UserConfigRepositoryOptions);
  load(): Promise<Result<UserConfigLoad, CoreError>>;
  save(config: UserConfig): Promise<Result<UserConfigSaveSuccess, CoreError>>;
}

class ProjectManifestRepository {
  constructor(options: ProjectManifestRepositoryOptions);
  load(): Promise<Result<ProjectManifestLoad, CoreError>>;
  save(input: ProjectManifestSaveInput): Promise<Result<ProjectManifestSaveSuccess, CoreError>>;
}

function getProjectManifestPath(projectDirectory: string): string;
function readTextFile(filePath: string): Promise<Result<TextFileRead, CoreError>>;
function writeJsonAtomically(input: AtomicWriteJsonInput): Promise<Result<AtomicWriteJsonSuccess, CoreError>>;
```

Repositories accept explicit `filePath` values. `getProjectManifestPath(projectDirectory)` is the single path constructor for the project document and returns `<projectDirectory>/.agents/skillpin.json`.

## 3. Contracts

### Documents

- User configuration v1 is `{ schemaVersion: 1, preferences: { theme: "system" }, sources: SkillSource[] }`.
- Project manifest v1 is `{ schemaVersion: 1, revision: nonNegativeInteger, managedSkills: ManagedSkillLink[] }`.
- Manifest entries contain exactly `linkName`, `sourceId`, `skillRelativePath`, `linkType`, and `targetFingerprint`. They must never contain a source-directory path.
- `linkType` is P1's persisted `"symlink" | "junction"`; `targetFingerprint` is the P1 raw lower-case 64-character SHA-256 digest, without a `sha256:` prefix.
- `skillRelativePath` must be non-empty and safe: no absolute path, drive-rooted path, NUL byte, empty segment, `.` segment, or `..` segment.

### Versioning and writes

- Missing files return `kind: "missing"` with an in-memory v1 default and do not create files.
- Schema v0 is migrated only after structural validation: config v0 adds `{ preferences: { theme: "system" } }`; manifest v0 adds `revision: 0`.
- Versions greater than 1 are read-only failures; never replace them with defaults.
- `ProjectManifestRepository.save({ baseRevision, managedSkills })` verifies the current revision and writes exactly `baseRevision + 1`. Callers cannot supply an arbitrary persisted revision.
- Normal saves call `load()` first so corrupt, unsupported, or legacy input cannot be silently overwritten.

### Atomic replacement

`writeJsonAtomically` creates a same-directory hidden temporary file, flushes both the immutable sibling `<file>.backup-<uuid>` and temporary JSON file before replacement, then renames the temporary file into place. It removes the temporary file after a failed attempt and returns backup/recovery paths when available.

## 4. Validation & Error Matrix

| Condition | Required behavior | Stable code | Recovery action |
| --- | --- | --- | --- |
| File absent | Return in-memory default; no write | none (`kind: "missing"`) | `create-file` at caller discretion |
| File cannot be read | Preserve source, return classified failure | `FILE_READ_FAILED` | `retry` |
| JSON is malformed | Preserve source; do not default or save over it | `JSON_PARSE_FAILED` | `fix-file` |
| Schema/value/path is invalid | Preserve source and report field path | `INVALID_USER_CONFIG` / `INVALID_PROJECT_MANIFEST` | `fix-file` |
| Future schema version | Do not modify document | `SCHEMA_VERSION_UNSUPPORTED` | `upgrade-skillpin` |
| v0 replacement fails | Original document remains at its path; expose recovery backup if created | `SCHEMA_MIGRATION_FAILED` | `retry` or `restore-backup` |
| Normal write fails | Temporary file cleanup is attempted; return recovery paths | `ATOMIC_WRITE_FAILED` | `retry` or `restore-backup` |
| Manifest revision differs from `baseRevision` | Do not write | `REVISION_CONFLICT` | `review-state` |

Use `CoreError` and `serializeSkillPinError` at service/CLI boundaries. A serialized error always includes `code`, `message`, `details`, `retryable`, and `recoveryAction`; never serialize raw stack traces.

## 5. Good / Base / Bad Cases

**Good — update a manifest:** load the manifest, use the returned `revision` as `baseRevision`, provide only validated managed-link records, then react to a possible `REVISION_CONFLICT` by reloading project state.

**Base — first run:** `load()` returns `{ kind: "missing", value: { schemaVersion: 1, revision: 0, managedSkills: [] } }`; no `.agents` directory is created until `save()` is intentionally called.

**Bad — recovery by overwrite:** catch `JSON_PARSE_FAILED`, construct an empty default, and call `save()`. `save()` deliberately re-loads first and must keep the malformed source unchanged.

## 6. Tests Required

Add or update Vitest coverage beside this contract for:

- valid v1 decode and deterministic rejection of unsupported keys, duplicate source IDs, case-insensitive duplicate link names, unsafe paths, bad fingerprint/link type, and invalid revision;
- missing document without an on-disk side effect;
- corrupt JSON and future version remaining byte-for-byte untouched;
- v0 migration creating a backup and v1 replacement;
- fault injection at an atomic write step preserving the original migration source;
- normal replacement creating a same-directory backup;
- manifest revision advancement and stale-base conflict;
- serialized `CoreError` and legal domain state transitions.

Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run verify-package` for core export changes. Run `npm run test:e2e` only when browser behavior changes.

## 7. Wrong vs Correct

```ts
// Wrong: a future or corrupt document is replaced with a default.
await writeFile(manifestPath, JSON.stringify(createEmptyProjectManifest()));

// Correct: repository load classifies the document and refuses unsafe overwrite.
const loaded = await repository.load();
if (!loaded.ok) return loaded;
const saved = await repository.save({
  baseRevision: loaded.value.value.revision,
  managedSkills,
});
```

Likewise, do not import `node:fs` persistence from the root package export:

```ts
// Wrong for browser-reachable code.
import { ProjectManifestRepository } from "@skillpin/core";

// Correct in Node-only CLI/service code.
import { ProjectManifestRepository } from "@skillpin/core/persistence";
```
