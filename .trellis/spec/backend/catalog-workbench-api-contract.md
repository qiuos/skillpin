# P8 Read-Only Catalog Workbench Contract

## 1. Scope / Trigger

Apply this contract when changing session-local catalog browsing, protected catalog routes, directory-derived skill grouping, or browser-safe P8 response shapes in `packages/{core,cli}`. P8 is read-only: it renders configured, enabled source candidates but never scans from the browser, mutates source configuration, project links, manifests, or source files.

## 2. Signatures

```ts
function buildCatalogBrowseItems(
  snapshot: CatalogSnapshot,
  query: string,
): readonly CatalogBrowseItem[];

SourceRuntime.catalog(query): Promise<Result<LocalCatalogResponse, CoreError>>
SourceRuntime.catalogCandidate(id): Promise<Result<LocalCatalogCandidateDetail, CoreError>>

GET /api/catalog?query=<text>
GET /api/catalog/candidates/:id
```

Both routes remain behind the existing P5 loopback/Origin/bearer transport guard and return `LocalApiResponse<T>` at `LOCAL_API_VERSION`.

## 3. Contracts

- `LocalCatalogResponse` exposes `items`, not raw snapshot groups. Each item is either `{ kind: "skill", id, group }` or `{ kind: "skill-group", id, name, skills }`; each `LocalCatalogGroup` remains the existing same-`linkName` source-selection unit.
- A directory becomes a `skill-group` only when a single source has two or more immediate child skill roots beneath that parent. For `engineering/frontend/{ui-design,react-development}`, publish `frontend` only; do not add an outer `engineering` item that merely contains subdirectories.
- Search still runs server-side through `searchCatalog()`. If any child of a directory skill group matches, return the whole group so a user can inspect or operate on all of its skills. List metadata must not contain `markdownBody`, `skillDirectory`, or `skillFilePath`.
- A candidate-detail route resolves the ID only from the current session `CatalogIndex` snapshot. It returns `markdownBody` and local paths solely for that selected, already-discovered candidate.
- Stable source/candidate ordering is retained inside each same-name group. Directory-group ordering is deterministic; P8 must not invent a preferred source candidate or project selection.
- A removed, disabled, failed, or stale candidate returns `CATALOG_CANDIDATE_NOT_FOUND` in the normal versioned error envelope. It never falls back to reading an arbitrary filesystem path.

## 4. Validation & Error Matrix

| Condition | Outcome |
| --- | --- |
| Missing bearer / invalid loopback transport | Existing P5 rejection before P8 route handling |
| Absent `query` | Successful response containing all browse `items` |
| Directory has fewer than two immediate child skill roots | Return its skills as normal `skill` items; do not manufacture a group |
| Search matches one child of a directory group | Return that `skill-group` with all of its member skills and per-skill match IDs |
| Unknown candidate ID | `422` `CATALOG_CANDIDATE_NOT_FOUND`; no filesystem read |
| Malformed percent-encoded candidate ID | `400` `API_REQUEST_INVALID` |
| No enabled scanned candidates | Successful `{ items: [], query }` response |
| Source rescan/remove after list retrieval | Detail lookup reads the current snapshot, so stale IDs fail safely |

## 5. Good / Base / Bad Cases

**Good — directory group without source-conflict confusion:** child roots `frontend/react` and `frontend/ui` from the same source produce one `skill-group` named `frontend`; a same-name candidate group inside each child still retains source-selection semantics.

**Base — no skills:** return a successful empty item list, allowing the web client to route to source management or show an empty state.

**Bad — infer a group from source conflicts or arbitrary descendants:** do not turn multiple candidates with one `linkName`, or an outer directory containing only nested folders, into a directory skill group.

## 6. Tests Required

- Core unit coverage must prove immediate-child grouping, nested-parent suppression, standalone skill preservation, and search returning the full matching directory group.
- Integration coverage must verify catalog routes require credentials, return the `items` union without leaking Markdown body, and return body/path only from explicit candidate detail.
- Root core API export tests/typecheck must prove P8 browser response types remain available without importing Node-only catalog modules.
- Existing source/session security tests must remain green.

## 7. Wrong vs Correct

```ts
// Wrong: expose P3 conflict groups directly and call them directory groups.
return { groups: searchCatalog(snapshot, query) };

// Correct: map source-relative directory browse items while retaining groups
// as the source-selection unit inside every item.
return { items: buildCatalogBrowseItems(snapshot, query), query };
```
