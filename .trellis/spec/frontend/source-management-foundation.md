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
  hasLoaded: boolean;
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
- Source refresh begins in a loading state and first runs when the session is online; it retries when a reconnected session returns online. Do not redirect a direct `/sources` visit to onboarding before the first source response resolves.
- `hasLoaded` means the server has successfully returned an authoritative source list. It stays false after an initial refresh failure; an empty `sources` array alone must never be interpreted as first-run configuration.
- With a successfully loaded empty source list, render the onboarding work surface and hide workspace navigation. With an unresolved or failed list, keep the current route and render a stable source error with a retry action instead. The first successful add navigates to `/sources`.
- The add/edit dialog trims a nonblank display name and validates its path through the server. Use the returned canonical path for save; server errors show their stable message rather than browser-side filesystem guesses.
- The directory browser may show only entrypoint labels and directory metadata. It preserves Unicode paths and sends pasted paths back through the typed API.
- Source rows always show path and enabled state, mark duplicate display names, show health/count/warnings/failure, and keep edit/rescan available for a failed source. The source page title is `28px`; source names, paths, status, toolbar text, and row actions are `24px` with `56px` action/input controls. The source table must flex and scroll independently so these readable rows remain accessible in the fixed-height window.
- All source mutations obey P6 `isReadOnly`: controls are disabled and provider methods reject stable `SESSION_READ_ONLY` while the protected session is not online. Preserve existing rows during reconnect.
- A removal first asks the server for impact. Show the managed-link count and require a second `confirmProjectImpact: true` request; UI copy must state that source directories, project links, and manifest are retained.

## 4. Validation & Error Matrix

| Condition | Browser behavior | User-facing behavior |
| --- | --- | --- |
| Initial source request pending | Keep route stable; show loading status after session exists | Do not flash or redirect away from a populated `/sources` route |
| Initial source request failed | Keep `hasLoaded: false`; do not clear prior rows or navigate to onboarding | Stable source error with a retry action; never show first-run setup merely because the local list is empty |
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

**Base — an authoritative empty source list:** after `hasLoaded` is true, show only first-run onboarding and an add-source action, not a dashboard or empty workbench navigation.

**Bad — treat a failed load as first-run setup:**

```tsx
const hasSources = sources.length > 0;
return hasSources ? <Workspace /> : <OnboardingPage />;
```

The initial array is empty before the protected request succeeds. Gate onboarding and route redirects on `hasLoaded` as well as `sources.length`.

**Bad — cache protected source/session data in browser storage:**

```ts
localStorage.setItem("skillpin.sources", JSON.stringify(sources));
```

The local service is the source of truth. Keep feature state in memory and refresh through the authenticated client.

## 6. Tests Required

- `local-api.test.ts` must cover authenticated source/directory request paths, percent-encoded source ids and directory paths, typed source summaries, removal impact decoding, and malformed source payload rejection.
- Playwright must mock only API endpoint requests (never broad `/api/**` module globs), then cover first-run onboarding, directory selection with Unicode path, source creation scan outcome, search/enable/rescan/remove actions, guarded removal confirmation, and the approved 28px/24px source-page typography.
- Retain P6 theme, dialog-focus, connection, and credential tests; P7 must not weaken their accessibility or private-credential guarantees.

- Playwright must cover an unavailable initial `GET /api/sources`: `/skills` or `/sources` stays on its route, onboarding is absent, a retry can recover source navigation, and the “技能 / 技能源” tabs then appear.

## 7. Wrong vs Correct

```tsx
// Wrong: redirect before the source response can establish whether sources exist.
if (sources.length === 0) navigate("/onboarding");

// Correct: wait for the initial source load before deciding empty-state routing.
if (!isLoading && sources.length === 0) navigate("/onboarding");
```

A loading-aware source provider prevents direct source-management routes from being replaced by onboarding during bootstrap.
