# P7 — First-run Onboarding, Directory Browser, and Source Management

## Goal

Enable a user with no configured local skill sources to add a first source safely, discover its `SKILL.md` candidates, and manage configured sources for the current local session. The feature must preserve the P5 protected-local-session boundary and prepare source data for P8 without implementing the P8 skills workbench.

## Requirements

1. **First-run routing and onboarding**
   - Load configured sources from the protected local API when the session becomes available.
   - When no sources exist, render only the onboarding flow as the main work surface; do not show a meaningless sources/skills workspace.
   - Make the primary onboarding action open the add-source dialog. When a source is successfully added, route to source management (P8 owns the populated skills workspace).

2. **Source configuration and validation**
   - Create and edit a source with a display name, absolute/canonical directory path, and enabled state.
   - Require a nonblank trimmed display name and path. Duplicate display names are allowed, but source rows always show the path and warn when names repeat.
   - The server is authoritative for existing/readable-directory validation and duplicate detection by canonical real path. Browser validation must use the server and surface its stable error message/recovery action.
   - Editing a path must persist the canonical replacement and obtain a new scan result before the UI treats the edit as complete.

3. **Safe built-in directory browser**
   - Offer session entry points for home, platform root, and session recent source paths.
   - Allow a user to paste a path or browse child directories. Directory responses contain metadata only (path, real path, label/name); they never expose ordinary-file contents.
   - Preserve Unicode/Chinese paths and display platform roots correctly (Windows drive root and macOS/Linux `/`).

4. **Scanning and health**
   - Adding, path-changing edits, and explicit rescans report valid-skill count, parse warnings, unreadable-child-directory warnings, or a source-scoped failure.
   - A no-skills scan is a valid, visible outcome.
   - A rescan changes only the session-local catalog snapshot; it does not rewrite source configuration.
   - A failed scan records source health but preserves unrelated source results. An inaccessible source must never produce fabricated current skills; the UI offers retry/edit.

5. **Source management**
   - Render a searchable source list with source path, enabled state, skill count, warnings, and health.
   - Support enable/disable, edit, rescan, and removal. Disabled sources remain configured and retain project association state, but are excluded from the default active catalog.
   - Before removal, inspect the current project and display the count/status of managed links referring to that source. Removal deletes only user configuration and in-memory scan state: it must not mutate the source directory, the current project’s links, or the project manifest.
   - A source failure must not hide healthy sources.

6. **Transport and session runtime**
   - Add authenticated P7 routes behind the existing loopback/Host/Origin/bearer guard. Each route returns the versioned `LocalApiResponse<T>` envelope.
   - Keep Node-only source/config/catalog filesystem code in the CLI runtime and `@skillpin/core/catalog` import boundary. Browser code imports only browser-safe contracts from `@skillpin/core` and calls `LocalApiClient`.
   - Session startup loads configured sources, scans enabled sources into the session-local catalog, and supplies configured source health to the current project inspector. Individual failures do not prevent the session from starting.
   - Recent paths are session-local and added after successful create/update; no source CRUD is added to the standalone CLI command surface.

## Acceptance Criteria

- [ ] With no configured sources, `/` resolves to an onboarding-only experience with an accessible “Add source” primary action and no meaningless workspace navigation.
- [ ] The user can choose a quick location, browse directories, or paste a path; server validation either returns a canonical directory or a stable source/directory error.
- [ ] Creating a readable source saves configuration, scans it, and displays a valid count, parse/unreadable-directory warnings, or an explicit no-skills result.
- [ ] A duplicate canonical real path is rejected even when entered through a different spelling or symlink.
- [ ] The sources page allows search, enable/disable, edit, rescan, and removal with a current-project impact warning.
- [ ] Removing a source changes neither its source directory nor any current-project link/manifest; it removes only configured source data and the session-local source scan/failure.
- [ ] A source scan failure is visible on that row without suppressing other configured sources.
- [ ] Windows drive roots, macOS/Linux roots, and Chinese paths round-trip and render without corruption.
- [ ] Directory browser and source management end-to-end tests cover the main usable flows.

## Definition of Done

- API/client/source management implementation is covered by focused unit/integration tests where the contract is nontrivial.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build --workspace=@skillpin/web`, and `npm run format:check` pass.
- P7 API and reusable frontend conventions are captured in `.trellis/spec/` if the implementation establishes a durable pattern.

## Technical Approach

### Runtime ownership

`ManagedSession` owns:

- `UserConfigRepository` located through the established config location helper;
- `SkillSourceService` for validated persistent user configuration;
- `SkillScanner` and `CatalogIndex` for a mutable, process-local scan snapshot;
- session-local recent source paths; and
- project source health inputs used to inspect the current project without altering it.

At session start, list sources and rescan each enabled source. Store successes/failures independently in `CatalogIndex`; a source failure must not abort startup. Source mutation routes update this state atomically from the UI perspective: persist through `SkillSourceService`, then scan/reconcile the matching in-memory record. On remove, delete the scan/failure record after the configuration mutation succeeds.

### Route contract

Use the existing `LocalApiRoute` extension seam and authenticated transport. Recommended stable routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sources` | configured source rows plus session scan/health summary |
| `POST` | `/api/sources` | validate, persist, scan, and return the created source summary |
| `PATCH` | `/api/sources/:id` | update display name/path/enabled; path changes scan before a success response |
| `DELETE` | `/api/sources/:id` | return current-project impact, then remove only config/session scan state after explicit confirmation request data |
| `POST` | `/api/sources/:id/scan` | rescan a source without writing configuration |
| `POST` | `/api/sources/validate` | validate a pasted/chosen candidate path without persistence |
| `GET` | `/api/directories/entrypoints` | safe quick locations |
| `GET` | `/api/directories?path=<encoded>` | metadata-only child-directory listing |

Request bodies are parsed with bounded JSON handling and validated structurally before reaching service code. `CoreError` is mapped to the project’s versioned `LocalApiError` shape; do not leak stack traces or arbitrary filesystem data.

`DELETE` takes an explicit `confirmProjectImpact` boolean. If current-project managed links use the source and confirmation is absent, return a stable `SOURCE_PROJECT_IMPACT` response that includes a count and leaves config/catalog unchanged. This keeps the warning server-truthful without changing P4 project state.

### Browser architecture

Extend `LocalApiClient` with typed source and directory operations and response decoders. Add a feature-local `SourceProvider`/hook beneath the existing `SessionProvider` to load source data, preserve UI state while reconnecting, and disable mutations in read-only mode.

Use these P7 feature boundaries:

- `features/onboarding/` for first-source state and entry action;
- `features/sources/source-list-page.tsx` for management view;
- `features/sources/source-dialog.tsx` for add/edit validation and submit;
- `features/sources/directory-browser.tsx` for metadata-only browsing;
- `features/sources/scan-progress.tsx` and `source-health.tsx` for outcome presentation.

Reuse P6 controls (`Dialog`, `Drawer`, `Button`, `TextInput`, `Checkbox`, `Badge`, `EmptyState`) and the accepted Linear-inspired visual system. Do not introduce a dashboard, gradients, glassmorphism, decorative animation, or persistence of session data/credentials in browser storage.

### Testing

- Extend CLI/session-route tests for success and failure envelopes, auth inheritance, source startup scanning, source-specific failure isolation, rescan semantics, and removal impact protection.
- Extend browser client tests for response validation and auth-backed request shapes.
- Add `tests/e2e/onboarding.spec.ts` and `tests/e2e/source-management.spec.ts`. The Vite-only E2E environment may use deterministic API mocking for browser interaction; it must cover onboarding, directory browsing/path validation, source creation outcome, source action controls, and impact-warning removal confirmation.

## Decision (ADR-lite)

### Context

P3 already provides source persistence, readable real-path validation, directory metadata browsing, scanning, and in-memory snapshot primitives. P5 already provides the only safe local HTTP boundary and P6 supplies a browser-safe session client. P7 needs source management without making browser code Node-aware or modifying a project merely because user configuration changes.

### Decision

Expose P3 capabilities through session-owned, authenticated P7 routes. Make the session-local `CatalogIndex` the source of scan health and candidate counts, while `SkillSourceService` remains the sole persistent configuration writer. Require an explicit server-checked project-impact confirmation before source removal.

### Consequences

- Filesystem validation/scanning and source config stay in Node-only code; the browser gets typed summaries, not filesystem contents or candidate Markdown.
- Source scans are ephemeral and isolated per local session, avoiding persistence of stale skill inventory.
- A P8 workbench can consume the snapshot later without coupling its UI to P7 dialog/list internals.
- The API surface grows, so route validators and client decoders must stay versioned and tested.

## Out of Scope

- P8 skills workbench, catalog search/detail, candidate comparison, Markdown rendering, and project change staging/apply UI.
- New standalone CLI source CRUD commands.
- Native desktop folder picker, desktop/tray integration, or cloud synchronization.
- Packaging final built Web assets into the CLI (P11 owns final packaging/copying).
- Mutating source directories, existing project links, or the project manifest during source removal.

## Technical Notes

- Requirements source: `SkillPin实施计划.md` P7 and `SkillPin产品技术一体化方案.md` F-02/F-03, API table, and AC-01/AC-02/AC-16.
- Relevant existing contracts: `.trellis/spec/backend/source-catalog-contract.md`, `.trellis/spec/backend/local-session-api-contract.md`, and `.trellis/spec/frontend/local-session-app-foundation.md`.
- Root `@skillpin/core` must remain browser-safe. CLI-only imports use `@skillpin/core/catalog`, `@skillpin/core/project`, `@skillpin/core/platform`, or other established Node-safe subpaths.
- P5’s static HTML fallback is still temporary; P11 owns packaging/copying the final Web build assets.
