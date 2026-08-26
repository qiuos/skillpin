# P3 Source Configuration and Catalog Contract

## 1. Scope / Trigger

P3 adds Node-only discovery and catalog behavior for user skill sources. It applies to standard user-config location discovery, source CRUD, directory browsing, `SKILL.md` recognition/parsing, source-local scans, same-name grouping, and in-memory search.

The `@skillpin/core` root remains browser-safe. All P3 filesystem, YAML, and catalog APIs are exposed only from `@skillpin/core/catalog`; future CLI/server code must import that subpath rather than the root package. User configuration still flows exclusively through `UserConfigRepository` from `@skillpin/core/persistence`—do not parse or overwrite `skillpin/config.json` directly.

## 2. Signatures

```ts
function getUserConfigPath(options?: UserConfigLocationOptions): string;

class SkillSourceService {
  list(): Promise<Result<readonly SkillSource[], CoreError>>;
  add(input: CreateSkillSourceInput): Promise<Result<SkillSource, CoreError>>;
  addAndScan(input: CreateSkillSourceInput, scanner: SkillSourceScanRunner): Promise<Result<SourceMutationScan, CoreError>>;
  update(id: string, input: UpdateSkillSourceInput): Promise<Result<SkillSource, CoreError>>;
  updateAndScan(id: string, input: UpdateSkillSourceInput, scanner: SkillSourceScanRunner): Promise<Result<SourceMutationScan, CoreError>>;
  setEnabled(id: string, enabled: boolean): Promise<Result<SkillSource, CoreError>>;
  remove(id: string): Promise<Result<SkillSource, CoreError>>;
}

function getDirectoryBrowserEntrypoints(
  options?: DirectoryBrowserEntrypointsOptions,
): readonly DirectoryBrowserEntry[];
function listDirectories(path: string): Promise<Result<DirectoryListing, CoreError>>;

class SkillScanner {
  scan(source: SkillSource): Promise<Result<SourceScan, CoreError>>;
}

class CatalogIndex {
  replaceSourceScan(scan: SourceScan): void;
  rescan(source: SkillSource, scanner: SourceScanRunner): Promise<Result<SourceScan, CoreError>>;
  recordSourceFailure(source: SkillSource, error: CoreError): void;
  removeSource(sourceId: string): void;
  snapshot(sources: readonly SkillSource[]): CatalogSnapshot;
}

function searchCatalog(
  snapshot: CatalogSnapshot,
  query: string,
): readonly CatalogSearchResult[];
```

`SourceScan` contains the configured source, parsed candidates, and non-fatal directory warnings. `ScannedSkillCandidate` extends the browser-safe candidate shape with `markdownBody`, `skillDirectory`, and `skillFilePath`; retain those filesystem-bearing fields behind the catalog subpath.

## 3. Contracts

### Configuration and source mutations

- `getUserConfigPath()` returns `skillpin/config.json` under `~/Library/Application Support` on macOS, `%APPDATA%` on Windows (home `AppData/Roaming` fallback), and `$XDG_CONFIG_HOME` or `~/.config` on Linux/other POSIX platforms. Accept explicit `platform`, `environment`, and `homeDirectory` values for deterministic tests.
- `SkillSourceService` trims submitted names/paths, requires a non-empty name plus an existing readable directory, canonicalizes the path with `realpath`, and persists only through `UserConfigRepository`.
- A canonical path may occur once across all configured source IDs. Duplicate display names are permitted. Disabling preserves configuration; removal only removes config and must never delete the source directory.
- `addAndScan()` and `updateAndScan()` persist a validated source and immediately return that source plus a non-persistent scan `Result`; an unsuccessful post-save scan does not roll back valid user configuration. Call `CatalogIndex.replaceSourceScan()`/`rescan()` to make a successful scan the session snapshot. Scan results are never added to user configuration.

### Directory browsing

- Browser entry points contain only home, platform-root, and supplied non-empty recent directory paths. They do not read regular-file content.
- `listDirectories()` validates the requested directory and returns only child directories (including resolvable directory symlinks), sorted by name. It never returns ordinary file entries or contents.

### Recognition, parsing, and cataloging

- A skill is a directory whose `SKILL.md` is a **regular** file. A discovered skill root stops recursive descent; descendants are not candidates.
- Every directory traversal resolves a real path and uses a visited-real-path set, preventing directory-symlink cycles.
- `SKILL.md` bytes receive a raw lower-case SHA-256 content fingerprint. Candidate IDs hash `sourceId` + NUL + source-relative path; relative paths use `/` separators.
- `linkName` is the skill directory basename. It must be one portable path segment: not empty/`.`/`..`, no separators, NUL, controls, or Windows-illegal characters. Invalid link names are scan warnings and not project-link candidates.
- `name` front matter sets display name with directory-name fallback. `description` sets summary, then the first readable Markdown paragraph, then `未提供说明`.
- YAML diagnostics/non-string name-or-description produce `INVALID_FRONT_MATTER`; invalid UTF-8 produces `INVALID_TEXT_ENCODING`; absent usable description produces `MISSING_DESCRIPTION`. A parser warning retains the candidate and does not stop its source scan.
- Groups use case-folded `linkName` keys. Default catalog snapshots include enabled sources only. Search is case-insensitive over display name, `linkName`, summary, Markdown body, source display name, and relative path; any candidate match returns its enclosing group with candidate-level matches.

## 4. Validation & Error Matrix

| Situation | Result | Required caller behavior |
| --- | --- | --- |
| Source path missing/not a directory/unreadable | `SOURCE_UNREADABLE` or `SOURCE_INVALID` | Keep configuration unchanged; let user edit/retry/disable the source. |
| Source canonical path duplicates another source | `SOURCE_DUPLICATE` with source ID/path | Do not persist the duplicate. |
| Source ID missing during edit/enable/remove | `SOURCE_NOT_FOUND` | Reload sources before retrying a stale UI operation. |
| Directory picker target unreadable/not a directory | `DIRECTORY_UNREADABLE` | Do not expose file content; prompt user to choose a valid directory. |
| Child directory or SKILL inspection fails | `SourceScanWarning` | Continue scanning all other children. |
| Source root cannot be scanned | `SOURCE_UNREADABLE` | Record failure in `CatalogIndex`; preserve other/latest successful scans. |
| YAML/UTF-8/description failure | candidate `parseWarning` | Keep candidate with fallbacks; do not abort source scan. |
| Unsafe directory basename | `INVALID_LINK_NAME` scan warning | Exclude only that candidate from conflict/project-link catalog. |

## 5. Good / Base / Bad Cases

**Good — canonical duplicate protection:** resolving `/skills-alias` to the existing real `/skills` must reject a second source with `SOURCE_DUPLICATE`; only the first canonical path is persisted.

**Base — empty first run:** a missing user config still comes from `UserConfigRepository.load()` as an in-memory default. The first source add writes it atomically; catalog scan data is never written into that file.

**Bad — root failure erases catalog:** do not clear every catalog source after one source cannot be read. Call `CatalogIndex.rescan()`/`recordSourceFailure()` so unrelated (and prior) source scans remain available.

**Bad — recurse after skill root:** once `parent/SKILL.md` is a regular file, never scan `parent/resources/child/SKILL.md`.

## 6. Tests Required

Add/maintain Vitest coverage for:

- all config-directory mappings with injected OS/environment values;
- add/update/enable/disable/remove, input trimming, canonical duplicate rejection, and non-deletion of source directories;
- directory-only listing and home/root/recent browser entry points;
- scanner root errors isolated from successful sources and `CatalogIndex.rescan()` failure retention;
- regular-file-only recognition, stop-descending behavior, and directory-symlink-loop termination;
- valid front matter, invalid YAML, invalid UTF-8, description fallbacks, safe link names, stable candidate fingerprints/IDs, grouping, disabled-source exclusion, and each search field;
- root-package browser safety plus the `@skillpin/core/catalog` package export.

For changes under this contract run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run pack`, and `npm run verify-package`. Run E2E only when browser behavior changes.

## 7. Wrong vs Correct

```ts
// Wrong: importing Node filesystem/catalog APIs through the browser-safe root.
import { SkillScanner } from "@skillpin/core";

// Correct: Node-only CLI/server code consumes the dedicated subpath.
import { CatalogIndex, SkillScanner } from "@skillpin/core/catalog";
```

```ts
// Wrong: one inaccessible source clears the whole session catalog.
index.removeSource(failedSource.id);

// Correct: retain unrelated/latest scans and surface the source-local error.
const result = await index.rescan(failedSource, scanner);
if (!result.ok) {
  // The index records the failure; other source snapshots remain available.
}
```
