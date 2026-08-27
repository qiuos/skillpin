# P8 Skills Workbench Foundation

## 1. Scope / Trigger

Apply this contract when implementing the `/skills` workbench, catalog state, source-candidate comparison, safe `SKILL.md` rendering, or copy actions under `packages/web/src/features/catalog/`.

## 2. Signatures

```ts
LocalApiClient.catalog(query?): Promise<LocalCatalogResponse>
LocalApiClient.catalogCandidate(id): Promise<LocalCatalogCandidateDetail>

<CatalogProvider><SkillsWorkbenchPage /></CatalogProvider>
```

## 3. Contracts

- `CatalogProvider` owns in-memory catalog results and uses the private P6 `LocalApiClient`; components never fetch directly or store credentials/catalog data in browser storage.
- `/skills` is a desktop two-window workbench: a compact one-row catalog toolbar, selectable skill list, and persistent read-only Skill Detail. The toolbar keeps search visible and places status/source filters in an anchored popover triggered by a visible filter button; the trigger exposes an active-filter count, and Escape or pointer-down outside closes the popover without resetting applied filters. The workbench fills available space without a 1040px width clamp. Its nested application/workspace/main/workbench layout must retain explicit height/min-height propagation so both windows are full-size on their first render; the virtual list must remeasure when its scroll element receives a new size and use the compact fixed row estimate. Each skill row has an explicit P9 enable/remove action; selecting the row only opens inspection. Narrow layouts stack the windows while keeping list navigation accessible.
- Workbench density is scoped by surface: Skill Detail retains a `28px` title and `24px` prose, while the catalog uses an `18px` skill name, `16px` one-line summary, and `44px` search/filter/action controls. A catalog row is a single compact line with a fixed name-priority column, ellipsized summary, optional compact parse-warning marker, and non-overlapping explicit action. Do not show source identity, candidate count, or redundant enabled/disabled copy in a catalog row; retain source and candidate comparison context in Skill Detail. Keep popover controls, action controls, long row text, and candidate/Markdown content wrap-safe; use independently scrolling catalog/detail panes rather than clipping or overlaying large text. Do not restore the temporary `文字调试（临时）` panel unless a future requirement explicitly reopens typography calibration.
- The first stable candidate is opened by default only for inspection. Detail displays source identity, candidate comparison when needed, and constrained Markdown; it has no path copy or project-mutation control.
- Render `markdownBody` with `react-markdown` + GFM. Do not enable raw HTML. Omit images. Allow only `http(s)` or relative anchors, using `target="_blank" rel="noreferrer"` for external links.
- Explicit loading, error, no-source/no-skills, query-empty, and stale-detail states are required. Source changes refresh the current catalog without wiping session credentials.

## 4. Validation & Error Matrix

| Condition | Browser behavior |
| --- | --- |
| Initial catalog pending | Render a loading state, retain route |
| Search has no matches | Show a searchable no-match state, not a broken detail pane |
| Candidate request fails/stale | Keep selection context and show a bounded detail error |
| Clipboard unavailable | Show bounded copy feedback; do not throw or change project state |
| Source Markdown contains HTML/image/unsafe scheme | Do not render it as executable HTML, remote image, or clickable unsafe link |
| First populated workbench render | Catalog and detail panels fill the available work area without a page refresh; remeasure virtual rows after size changes |
| Compact catalog density | The catalog toolbar stays one row with 44px controls; rows use an 18px name, 16px one-line ellipsized summary, 44px action, and no source/candidate/status copy. Skill Detail retains its 28px/24px reading scale. |
| Mobile/narrow viewport | Stack panes while retaining labels and controls |

## 5. Good / Base / Bad Cases

**Good:** select a metadata row, then load exactly one candidate body and render it with the constrained Markdown component map.

**Base:** a group with one candidate still shows source/comparison context; staging stays on its explicit catalog-row action, not in the detail pane.

**Bad:** use `dangerouslySetInnerHTML`, source content as a direct browser route, or an "Apply" button in P8.

## 6. Tests Required

- Local API client tests must validate catalog response decoding, percent-encoded detail paths, and bearer authentication.
- Playwright must cover a populated root-started skills workbench with the Skills tab selected, group/candidate detail rendering, search, compact filter-popover keyboard/outside-click behavior and active-filter count, source-hidden one-line catalog rows, fresh full-height two-window rendering, 18px/16px catalog typography with 44px actions, retained 28px/24px detail typography, removed debugger controls, and long-row action separation.
- Retain P6/P7 theme, focus, source-routing, and credential-private tests.

## 7. Wrong vs Correct

```tsx
// Wrong: bulk bodies in a catalog list or raw HTML rendering.
<div dangerouslySetInnerHTML={{ __html: candidate.markdownBody }} />

// Correct: explicit detail response with a restricted renderer.
<ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
  {detail.markdownBody}
</ReactMarkdown>
```
