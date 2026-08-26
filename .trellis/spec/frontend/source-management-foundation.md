# P7 Source Management Foundation

## 1. Scope / Trigger

This contract applies to browser source onboarding, source list actions, source dialogs, directory browsing, and source-related typed local API calls in `packages/web/src/features/{onboarding,sources}/` and `packages/web/src/api/local-api.ts`.

P7 manages configured source directories only. It prepares the P8 workbench but does not render catalog search, skill details, Markdown, comparison, or project-apply UI.

## 2. Signatures

```ts
new LocalApiClient()
  .sources(): Promise<LocalSourceListResponse>
  .addSource(input): Promise<LocalSourceSummary>
  .updateSource(id, input): Promise<LocalSourceSummary>
  .rescanSource(id): Promise<LocalSourceSummary>
  .removeSource(id, confirmProjectImpact?): Promise<LocalSourceRemoveResult>
  .validateSourcePath(path): Promise<LocalSourcePathValidation>
  .directoryEntrypoints(): Promise<readonly LocalDirectoryBrowserEntrypoint[]>
  .directories(path): Promise<LocalDirectoryListing>

useSources(): {
  sources: readonly LocalSourceSummary[];
  isLoading: boolean;
  error: LocalApiClientError | null;
  add(input): Promise<LocalSourceSummary>;
  update(id, input): Promise<LocalSourceSummary>;
  rescan(id): Promise<LocalSourceSummary>;
  remove(id, confirmed?): Promise<LocalSourceRemoveResult>;
  refresh(): Promise<void>;
}
```

`SourceProvider` must be rendered below `SessionProvider` and consumes the existing private in-memory `LocalApiClient` through `useLocalApiClient()`.

## 3. Contracts

- Source and directory calls use the authenticated `LocalApiClient`; feature components do not call `fetch`, store credentials, or duplicate response decoding.
- Source refresh begins in a loading state until a non-null session can load configuration. Do not redirect a direct `/sources` visit to onboarding before the first source response resolves.
- With no configured sources, render the onboarding work surface and hide workspace navigation. The first successful add navigates to `/sources`; the populated `/skills` route remains only a short P8 placeholder.
- The add/edit dialog trims a nonblank display name and validates its path through the server. Use the returned canonical path for save; server errors show their stable message rather than browser-side filesystem guesses.
- The directory browser may show only entrypoint labels and directory metadata. It preserves Unicode paths and sends pasted paths back through the typed API.
- Source rows always show path and enabled state, mark duplicate display names, show health/count/warnings/failure, and keep edit/rescan available for a failed source.
- All source mutations obey P6 `isReadOnly`: controls are disabled and provider methods reject stable `SESSION_READ_ONLY` while the protected session is not online. Preserve existing rows during reconnect.
- A removal first asks the server for impact. Show the managed-link count and require a second `confirmProjectImpact: true` request; UI copy must state that source directories, project links, and manifest are retained.

## 4. Validation & Error Matrix

| Condition | Browser behavior | User-facing behavior |
| --- | --- | --- |
| Initial source request pending | Keep route stable; show loading status after session exists | Do not flash or redirect away from a populated `/sources` route |
| Malformed/version-mismatched source payload | `LocalApiClient` throws `LOCAL_API_INVALID_RESPONSE` | Stable source error, no raw payload |
| Server path validation failure | Keep form values and surface stable server error | User can correct/paste/browse another path |
| Source scan failure | Preserve row with `health: "failed"` and failure message | Edit or retry through Rescan |
| Zero scan candidates | Preserve row with `health: "no-skills"` | Visible valid zero-skill outcome |
| Reconnecting/read-only session | Disable mutations without clearing source state | Explicit reconnect notice |
| Removal impact result | Open confirmation dialog; do not delete row | Show count and source-only removal promise |

## 5. Good / Base / Bad Cases

**Good — use server canonicalization before saving:**

```ts
const validated = await client.validateSourcePath(input.path);
await onSave({ ...input, path: validated.path });
```

**Base — an empty source list:** show only first-run onboarding and an add-source action, not a dashboard or empty workbench navigation.

**Bad — cache protected source/session data in browser storage:**

```ts
localStorage.setItem("skillpin.sources", JSON.stringify(sources));
```

The local service is the source of truth. Keep feature state in memory and refresh through the authenticated client.

## 6. Tests Required

- `local-api.test.ts` must cover authenticated source/directory request paths, percent-encoded source ids and directory paths, typed source summaries, removal impact decoding, and malformed source payload rejection.
- Playwright must mock only API endpoint requests (never broad `/api/**` module globs), then cover first-run onboarding, directory selection with Unicode path, source creation scan outcome, search/enable/rescan/remove actions, and guarded removal confirmation.
- Retain P6 theme, dialog-focus, connection, and credential tests; P7 must not weaken their accessibility or private-credential guarantees.

## 7. Wrong vs Correct

```tsx
// Wrong: redirect before the source response can establish whether sources exist.
if (sources.length === 0) navigate("/onboarding");

// Correct: wait for the initial source load before deciding empty-state routing.
if (!isLoading && sources.length === 0) navigate("/onboarding");
```

A loading-aware source provider prevents direct source-management routes from being replaced by onboarding during bootstrap.
