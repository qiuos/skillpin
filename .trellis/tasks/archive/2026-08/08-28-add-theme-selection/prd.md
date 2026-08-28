# Add theme selection

## Goal

Allow users to select a visual theme for SkillPin: rename the current parchment-style appearance to **羊皮卷主题**, and add **深色主题** and **浅色主题**. Persist the user’s choice locally and apply it whenever the web application starts.

## What I already know

- The web UI is a React/Vite application in `packages/web`.
- The existing visual system is CSS-variable based in `packages/web/src/styles.css`, with parchment and gold variables used throughout.
- The main shell header (`packages/web/src/app/app.tsx`) currently contains product/navigation controls, connection status, and an end-session action.
- No existing theme-selection or browser storage usage was found in the web source.
- User explicitly requires an ASCII UI sketch to be confirmed before implementation.

## Requirements (evolving)

- Provide an icon-only in-app control to select one of three named themes; do not add a new text control to the top-right action area.
  - 羊皮卷主题 — the current visual appearance, renamed only.
  - 深色主题.
  - 浅色主题.
- Apply the selected theme across the whole application UI.
- Persist the user’s selected theme locally and restore/apply it on every application startup.
- Preserve a safe fallback to 羊皮卷主题 when no saved preference exists or the saved value is invalid.
- Do not start implementation until the user confirms the ASCII sketch.

## Acceptance Criteria (evolving)

- [ ] Users can choose 羊皮卷主题、深色主题 or 浅色主题 from a visible theme selector.
- [ ] Selecting a theme updates the UI immediately.
- [ ] A selected theme survives a browser/app restart and is applied on startup.
- [ ] First-time/invalid-preference behavior uses 羊皮卷主题.
- [ ] The existing visual theme remains visually equivalent when 羊皮卷主题 is selected.
- [ ] Automated tests cover preference loading, fallback, and persistence.

## Definition of Done

- Tests added or updated where appropriate.
- Lint, typecheck, and relevant test suites pass.
- Existing behavior remains intact.

## Out of Scope

- Following the operating system’s color-scheme preference automatically.
- Per-page or per-project themes.
- Custom user-defined colors.

## Technical Notes

- Likely implementation: set a theme attribute/class on the document root; define each theme through shared CSS custom-property tokens; store the selected value in `localStorage`.
- Confirmed UI constraint: keep the existing top-right session-status and end-session actions unchanged.
- Confirmed UI placement: an icon-only theme trigger immediately beside the `SkillPin` product name, before the primary navigation. Its accessible name will expose the current theme and opening behavior.
- Files inspected: `packages/web/src/app/app.tsx`, `packages/web/src/styles.css`, `packages/web/src/components/controls.tsx`, `tests/e2e/app.spec.ts`.

## Decision (ADR-lite)

**Context**: The theme selector must remain easy to find without changing the existing top-right session controls.

**Decision**: Add an icon-only theme-menu trigger directly after the `SkillPin` product name and before the primary navigation. Use the current parchment appearance as the default and as the `羊皮卷主题` option. Store a validated theme key in browser local storage and apply the corresponding root theme token set at application startup.

**Consequences**: The control remains available across all application pages and does not crowd the right-side session actions. The menu must provide accessible text because the visible trigger is icon-only.

## Confirmed Design

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ SkillPin [theme icon]   [技能] [技能源]       [local session] [结束 SkillPin]│
└──────────────────────────────────────────────────────────────────────────────┘

Clicking the theme icon opens a menu containing:
  ✓ 羊皮卷主题
    深色主题
    浅色主题
```

User approved this design on August 28, 2026.
