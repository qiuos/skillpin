# P8 Skills Workbench Foundation

## 1. Scope / Trigger

Apply this contract when implementing the `/skills` workbench, catalog state, directory skill-group presentation, source-candidate comparison, safe `SKILL.md` rendering, or copy actions under `packages/web/src/features/catalog/`.

## 2. Signatures

```ts
LocalApiClient.catalog(query?): Promise<LocalCatalogResponse>
LocalApiClient.catalogCandidate(id): Promise<LocalCatalogCandidateDetail>

type LocalCatalogItem =
  | { kind: "skill"; id: string; group: LocalCatalogGroup }
  | { kind: "skill-group"; id: string; name: string; skills: LocalCatalogGroup[] };

<CatalogProvider><SkillsWorkbenchPage /></CatalogProvider>
```

## 3. Contracts

- `CatalogProvider` owns in-memory `LocalCatalogItem[]` results and uses the private P6 `LocalApiClient`; components never fetch directly or store credentials/catalog data in browser storage.
- `/skills` is a desktop two-window workbench: a compact one-row catalog toolbar, selectable skill list, and persistent read-only Skill Detail. The toolbar keeps search visible and places status/source filters in an anchored popover triggered by a visible filter button; the trigger exposes an active-filter count, and Escape or pointer-down outside closes the popover without resetting applied filters. The workbench fills available space without a 1040px width clamp. Its nested application/workspace/main/workbench layout must retain explicit height/min-height propagation so both windows are full-size on first render; the virtual list remeasures when its scroll element changes size and uses a compact fixed-row estimate. Narrow layouts stack the windows while keeping list navigation accessible.
- A `skill` item renders as the existing one-line single-skill row with `◇` and an explicit P9 enable/remove action. A `skill-group` remains one line but uses `▣`, a "技能组 · 包含 N 个技能 · X / N 已启用" description, group-level action copy, plus a light background and left border. The distinction must not rely on color alone.
- Clicking a group-row trigger opens an accessible `Dialog`; it lists every member with its readable display name, summary, and individual enable/remove action. It also has a group-level action. The existing Dialog focus trap, Escape close, and trigger-focus return must be retained.
- Selecting a single-skill row remains inspection-only. The first stable candidate opens by default only for inspection. Detail displays source identity, candidate comparison when needed, and constrained Markdown; it has no path copy or project-mutation control.
- Render `markdownBody` with `react-markdown` + GFM. Do not enable raw HTML. Omit images. Allow only `http(s)` or relative anchors, using `target="_blank" rel="noreferrer"` for external links.
- Explicit loading, error, no-source/no-skills, query-empty, and stale-detail states are required. Source changes refresh the current catalog without wiping session credentials.

## 4. Validation & Error Matrix

| Condition | Browser behavior |
| --- | --- |
| Initial catalog pending | Render a loading state, retain route |
| Search has no matches | Show a searchable no-match state, not a broken detail pane |
| Catalog item is `skill-group` | Keep a single compact group row and show its total/enabled count in the description |
| Group-row trigger clicked | Open the member-management dialog; Escape/close returns focus to the trigger |
| Candidate request fails/stale | Keep selection context and show a bounded detail error |
| Source Markdown contains HTML/image/unsafe scheme | Do not render it as executable HTML, remote image, or clickable unsafe link |
| First populated workbench render | Catalog and detail panels fill the available work area without a page refresh; remeasure virtual rows after size changes |
| Mobile/narrow viewport | Stack panes while retaining labels and controls |

## 5. Good / Base / Bad Cases

**Good:** a directory group remains one row, opens a dialog containing readable member names, and supports a group or per-member P9 action without exposing Markdown bodies in the catalog response.

**Base:** a `skill` item whose same-name group has one candidate still shows source/comparison context; inspection stays separate from mutation.

**Bad:** represent a directory group only by color, flatten every group member into the main list, or use a dialog row click as an implicit project mutation.

## 6. Tests Required

- Local API client tests must validate the `items` discriminated-union decoder, percent-encoded detail paths, and bearer authentication.
- Playwright must cover populated directory-group rows, non-color group affordances, group dialog member display, batch and individual actions, Escape focus return, searchable catalog/detail rendering, compact filter-popover keyboard/outside-click behavior, and long-row action separation.
- Retain P6/P7 theme, focus, source-routing, credential-private, and Markdown safety tests.

## 7. Wrong vs Correct

```tsx
// Wrong: a group is indistinguishable from a skill and cannot be inspected.
<button>{item.name}</button>

// Correct: group semantics are visible before opening an accessible dialog.
<button aria-label={`打开技能组 ${item.name}`} className="skill-row--group">
  ▣ {item.name} · 技能组 · 包含 {item.skills.length} 个技能
</button>
```
