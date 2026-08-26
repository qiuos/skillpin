# P7 Protected Source Management Contract

## 1. Scope / Trigger

This contract applies whenever work changes local skill-source configuration, source scans, directory browsing, or the protected P7 API in `packages/cli/src/{session,server/routes}/` and browser-safe P7 shapes in `packages/core/src/api/`.

The CLI session owns Node-only config, realpath validation, directory metadata listing, scanning, and project-link impact inspection. Browser code receives only versioned summaries; it must never import a filesystem service or receive `SKILL.md` contents.

## 2. Signatures

```ts
new SourceRuntime({ configFilePath?, inspectProject })
  .initialize(): Promise<Result<void, CoreError>>
  .list(): Promise<Result<LocalSourceListResponse, CoreError>>
  .add(input): Promise<Result<LocalSourceSummary, CoreError>>
  .update(sourceId, input): Promise<Result<LocalSourceSummary, CoreError>>
  .rescan(sourceId): Promise<Result<LocalSourceSummary, CoreError>>
  .remove(sourceId, confirmed): Promise<Result<LocalSourceRemoveResult, CoreError>>
  .validatePath(path): Promise<Result<LocalSourcePathValidation, CoreError>>
  .entrypoints(): readonly LocalDirectoryBrowserEntrypoint[]
  .directories(path): Promise<Result<LocalDirectoryListing, CoreError>>

GET    /api/sources
POST   /api/sources
PATCH  /api/sources/:id
POST   /api/sources/:id/scan
DELETE /api/sources/:id
POST   /api/sources/validate
GET    /api/directories/entrypoints
GET    /api/directories?path=<encoded>
```

Every response is `LocalApiResponse<T>` at `LOCAL_API_VERSION`. The root `@skillpin/core` export is browser-safe: source rows, scan summaries, validation results, directory metadata, and removal impact only.

## 3. Contracts

- `ManagedSession` creates one `SourceRuntime` per local session and initializes it before serving. Its `CatalogIndex` is session-local; a rescan never rewrites user configuration.
- `SkillSourceService` remains the only persistent source-config writer. Validation canonicalizes a readable directory path through the server, so path duplicates are decided by the server's real-path rules.
- On source add or path-changing edit, persist the accepted source then obtain a fresh scan summary before returning. Scan errors are stored per source and must not erase other scan results.
- Disabled sources remain configured and visible. They are excluded from startup active scans, while project inspection still identifies them as disabled through the dynamic `ProjectSnapshotServiceOptions.sources` callback.
- Directory routes return only `{ directoryPath, entries: [{ name, path, realPath }] }`; they never read or serialize ordinary file contents. Entrypoints include platform root, home, and session-recent source paths.
- Removing a source inspects the current project first. With managed links and no `confirmProjectImpact: true`, return `{ kind: "impact", impact }` without mutation. Confirmed removal changes only source config and session catalog state; it must not touch the source directory, project links, or manifest.
- P7 routes are additional routes behind the existing exact loopback/Host/Origin/bearer guard. Route dispatch first filters by pathname and then chooses the HTTP method, so `GET` and `POST` variants of one pathname both remain reachable.

## 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Missing or malformed JSON body | `400` versioned `API_REQUEST_INVALID`; no runtime call |
| Missing source input fields or non-boolean `enabled` | `400` versioned `API_REQUEST_INVALID` |
| Blank, non-directory, unreadable, or duplicate canonical path | `422` stable `CoreError`-derived envelope; configuration unchanged |
| Malformed percent-encoded source id | `400` versioned `API_REQUEST_INVALID`; never leave the HTTP response open |
| Unknown source id | `422` `SOURCE_NOT_FOUND` envelope |
| Source scan failure | successful source operation with `health: "failed"` and source-scoped `failure`; unrelated rows remain readable |
| No valid skills | successful scan with `health: "no-skills"` and a zero count |
| Removal with project impact but no confirmation | `200` `{ kind: "impact" }`; no config/catalog/project mutation |
| Missing bearer or failed local transport guard | existing P5 rejection before source route handling |

## 5. Good / Base / Bad Cases

**Good — route returns only a typed summary after a scan:**

```ts
const created = await session.sourceRuntime.add(input);
writeJson(response, success(created.value), 201);
```

**Base — a source has no skill candidates:** return an enabled row with `health: "no-skills"`, `scan.skillCount: 0`, and no synthetic candidate.

**Bad — browse or remove through a project mutation API:**

```ts
await readFile(path.join(directory, "SKILL.md"), "utf8");
await projectChangeService.apply(/* remove project links */);
```

Directory browsing must not expose Markdown contents, and removing a configured source is not a project-link transaction.

## 6. Tests Required

- Integration tests must bootstrap the real protected session, assert source routes still reject unauthenticated requests, and check versioned success/failure envelopes.
- Cover Unicode paths, metadata-only directory listings, canonical path validation, source-specific scan failure isolation, and a rescan that leaves the config file byte-for-byte unchanged.
- Cover malformed source ids as a bounded `400` response rather than an unhandled route.
- Verify impact-only and confirmed removal leave source files, project links, and `.agents/skillpin.json` unchanged.
- Route tests must exercise method variants sharing the same pathname so dispatcher ordering cannot regress.

## 7. Wrong vs Correct

```ts
// Wrong: let the browser decide filesystem validity or inspect Markdown.
const candidate = await fetch(`/api/directories?path=${path}`)
  .then((response) => response.text());

// Correct: the protected runtime validates and returns typed metadata.
const validated = await session.sourceRuntime.validatePath(path);
const listing = await session.sourceRuntime.directories(path);
```

Keep realpath, filesystem, scanner, persistence, and impact logic inside the session-owned CLI runtime.
