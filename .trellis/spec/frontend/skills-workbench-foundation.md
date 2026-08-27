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
- `/skills` is a desktop two-window workbench: compact filters inside the catalog toolbar, selectable skill list, and persistent read-only Skill Detail. The workbench fills available space without a 1040px width clamp. Its nested application/workspace/main/workbench layout must retain explicit height/min-height propagation so both windows are full-size on their first render; the virtual list must remeasure when its scroll element receives a new size and measure dynamically wrapping rows. Each skill row has an explicit P9 enable/remove action; selecting the row only opens inspection. Narrow layouts stack the windows while keeping list navigation accessible.
- Skills-workbench typography is fixed and scoped: a skill name/title uses `28px`; all other workbench text, including filters, status, detail prose, empty states, and action buttons, uses `24px`. Skill action controls are at least `56px` tall; rows must retain enough space for two wrapped title and summary lines without overlapping the action. Keep action controls, source chips, long row text, and candidate/Markdown content wrap-safe; use independently scrolling catalog/detail panes rather than clipping or overlaying large text. Do not restore the temporary `文字调试（临时）` panel unless a future requirement explicitly reopens typography calibration.
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
| Fixed workbench typography | Skill names/titles render at 28px and all other workbench text/actions render at 24px; 56px action controls, rows, toolbars, and detail content wrap or scroll without clipping/overlap |
| Mobile/narrow viewport | Stack panes while retaining labels and controls |

## 5. Good / Base / Bad Cases

**Good:** select a metadata row, then load exactly one candidate body and render it with the constrained Markdown component map.

**Base:** a group with one candidate still shows source/comparison context; staging stays on its explicit catalog-row action, not in the detail pane.

**Bad:** use `dangerouslySetInnerHTML`, source content as a direct browser route, or an "Apply" button in P8.

## 6. Tests Required

- Local API client tests must validate catalog response decoding, percent-encoded detail paths, and bearer authentication.
- Playwright must cover a populated root-started skills workbench with the Skills tab selected, group/candidate detail rendering, search, the no-project-mutation comparison wording, fresh full-height two-window rendering, fixed 28px/24px typography, 56px action controls, removed debugger controls, and long-row action separation.
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
