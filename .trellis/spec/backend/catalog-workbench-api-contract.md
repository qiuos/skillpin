# P8 Read-Only Catalog Workbench Contract

## 1. Scope / Trigger

Apply this contract when changing session-local catalog browsing, protected catalog routes, or the browser-safe P8 response shapes in `packages/{core,cli}`. P8 is strictly read-only: it renders configured, enabled source candidates but never scans from the browser, mutates source configuration, project links, manifests, or source files.

## 2. Signatures

```ts
SourceRuntime.catalog(query): Promise<Result<LocalCatalogResponse, CoreError>>
SourceRuntime.catalogCandidate(id): Promise<Result<LocalCatalogCandidateDetail, CoreError>>

GET /api/catalog?query=<text>
GET /api/catalog/candidates/:id
```

Both routes remain behind the existing P5 loopback/Origin/bearer transport guard and return `LocalApiResponse<T>` at `LOCAL_API_VERSION`.

## 3. Contracts

- List responses return searchable group/candidate metadata only: source identity/path, names, summary, relative path, parse warning, and matching candidate IDs. They must not contain `markdownBody`, `skillDirectory`, or `skillFilePath`.
- A candidate-detail route resolves the ID only from the current session `CatalogIndex` snapshot. It returns `markdownBody` and local paths solely for that selected, already-discovered candidate.
- Catalog group and default-candidate order are the existing stable P3 `CatalogIndex` order. P8 must not invent a preferred candidate or create a project selection.
- Query matching uses P3 `searchCatalog()`; its body search occurs server-side. The browser must not receive every Markdown body to implement search.
- A removed, disabled, failed, or stale candidate returns `CATALOG_CANDIDATE_NOT_FOUND` in the normal versioned error envelope. It never falls back to reading an arbitrary filesystem path.

## 4. Validation & Error Matrix

| Condition | Outcome |
| --- | --- |
| Missing bearer / invalid loopback transport | Existing P5 rejection before P8 route handling |
| Absent `query` | Successful empty-query catalog response |
| Unknown candidate ID | `422` `CATALOG_CANDIDATE_NOT_FOUND`; no filesystem read |
| Malformed percent-encoded candidate ID | `400` `API_REQUEST_INVALID` |
| No enabled scanned candidates | Successful `groups: []` response |
| Source rescan/remove after list retrieval | Detail lookup reads the current snapshot, so stale IDs fail safely |

## 5. Good / Base / Bad Cases

**Good — metadata list plus explicit detail:** list `/api/catalog` first, then fetch `/api/catalog/candidates/:id` only when the user selects a candidate.

**Base — no skills:** return a successful empty group list, allowing the web client to route to source management or show an empty state.

**Bad — use a browser supplied path to read content:** never add `GET /api/files?path=...`; candidate ID lookup is the only P8 content entry point.

## 6. Tests Required

- Integration coverage must verify the catalog routes require credentials, search metadata without leaking Markdown body, and return body/path only from explicit candidate detail.
- Root core API export tests/typecheck must prove P8 browser response types remain available without importing Node-only catalog modules.
- Existing source/session security tests must remain green.

## 7. Wrong vs Correct

```ts
// Wrong: broad content exposure in every list row.
return snapshot.groups;

// Correct: map only browser-safe metadata; resolve body by catalog candidate ID.
return runtime.catalog(query);
```
