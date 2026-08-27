# Quality Guidelines

## Formatting and linting

The repository uses Prettier with double quotes and trailing commas (`.prettierrc.json`) and ESLint flat config (`eslint.config.js`). Keep source formatting compatible with `npm run format:check` and fix lint violations rather than disabling rules broadly.

## Accessibility and browser testing

Make visible UI testable through semantic HTML and accessible names. The current browser test at `tests/e2e/app.spec.ts` verifies the page through a heading role and visible text rather than internal implementation details.

Run these checks for UI changes:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Chromium browser E2E and the general quality workflow both run on Ubuntu, macOS, and Windows; see `../backend/p10-cross-platform-acceptance-contract.md` for the P10 evidence contract.

## Styling

The shell uses a single global stylesheet imported by `main.tsx` (`packages/web/src/styles.css`). Visual language is an **Octopath HD-2D skill workbench**:

- **Tokens**: dusk canvas (`--dusk: #2a2218`), parchment windows (`--parchment: #f3ead3`), antique gold frames (`--gold: #c6a15a`, `--gold-deep: #8d6a2e`), and wine selection cursor (`--wine: #8a3b32`). These root tokens define the fixed workbench theme.
- **Frame & type**: `.ot-window` provides parchment texture, gold double frame, corner bosses, and hard pixel-like shadow. Use a system serif stack only; no webfont packages. CSS-only transitions honor `prefers-reduced-motion`. Keep the readable root scale centralized in `styles.css`: `--font-body` is 17px, `--font-ui` is 16px, `--font-small` is 16px, and `--control-height` is 44px. Primary interface text must be at least `--font-ui`; reserve a smaller size only for compact, non-primary content. In the Skills workbench, primary source/filter text deliberately matches catalog rows at 22px; retain smaller 16px/44px row actions for compact list density.
- **Custom filter menus**: When a native `<select>` does not match the workbench frame, use an accessible trigger button plus a `role="listbox"` menu. The trigger must expose the current label and `aria-expanded`; options must be native buttons with `role="option"` and `aria-selected`; selection, Escape, and pointer-down outside the component must all close the menu. Cover keyboard selection and outside-click closure in Playwright.
- **Chrome**: no sidebar or KPI cards. `.identity-bar` contains product name, `nav[aria-label="SkillPin 功能分区"]` when an authoritative source list is nonempty, connection state, and end-session action. Render the connection state as an accessible, labelled, 52px framed badge with a state-colored marker and visible state wording—not a dot-only indicator—and keep the end-session action at the same 52px target with 24px text. Navigation tabs use 24px text with a 52px minimum target; on narrow screens the navigation wraps below the product name. Do not add an appearance entry or settings drawer without an explicit product requirement. Skills uses a two-window catalog/detail workbench plus an always-visible bottom command bar; detail is read-only.
- **Atmosphere**: use original CSS-only backdrop decoration (e.g. layered gradients, light, mist, or particles) behind the Skills workbench and mark decorative markup `aria-hidden`. Keep it `pointer-events: none` and behind interactive content. Do not animate `transform` on an interactive panel or an ancestor of buttons/inputs: it makes Playwright wait for an unstable element and can block real clicks; animate only the non-interactive backdrop and honor `prefers-reduced-motion`.
- **Scrollbars**: every app-owned overflow surface uses the shared `--scrollbar-track`, `--scrollbar-thumb`, and `--scrollbar-thumb-hover` tokens with both Firefox `scrollbar-color`/`scrollbar-width` and Chromium/WebKit pseudo-elements. Do not leave a browser-default white track in a themed panel; narrow-screen outer-page scrolling uses `--scrollbar-page-track` instead.
- **Contracts to keep when restyling**: accessible names used by e2e, focus-visible rings, skip-link, workbench labels (`技能工作台`, `技能源与筛选`, `技能目录`, `技能详情`), and the fixed CSS root-token theme.

Prefer token/class updates in `styles.css` over new UI kits or CSS-in-JS. Do not restore sidebar, KPI, or SaaS-dashboard chrome without an explicit design task.

## Avoid

- Do not remove semantic headings or accessible labels just to satisfy visual styling.
- Do not add generated build output to source control.
- Do not make Web depend on CLI source for data or behavior.
- Do not add webfont files, animation libraries, or Tailwind/shadcn solely for restyles when token CSS suffices.
