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
- **Frame & type**: `.ot-window` provides parchment texture, gold double frame, corner bosses, and hard pixel-like shadow. Use a system serif stack only; no webfont packages. CSS-only transitions honor `prefers-reduced-motion`. Keep the readable root scale centralized in `styles.css`: `--font-body` and `--font-ui` are 15px, `--font-small` is 13px, and `--control-height` is 38px; do not reintroduce 10–12px secondary UI text without a compact, non-primary purpose.
- **Chrome**: no sidebar or KPI cards. `.identity-bar` contains product name, `nav[aria-label="SkillPin 功能分区"]` when an authoritative source list is nonempty, connection state, and end-session action. Do not add an appearance entry or settings drawer without an explicit product requirement. Skills uses a two-window catalog/detail workbench plus an always-visible bottom command bar; detail is read-only.
- **Contracts to keep when restyling**: accessible names used by e2e, focus-visible rings, skip-link, workbench labels (`技能工作台`, `技能源与筛选`, `技能目录`, `技能详情`), and the fixed CSS root-token theme.

Prefer token/class updates in `styles.css` over new UI kits or CSS-in-JS. Do not restore sidebar, KPI, or SaaS-dashboard chrome without an explicit design task.

## Avoid

- Do not remove semantic headings or accessible labels just to satisfy visual styling.
- Do not add generated build output to source control.
- Do not make Web depend on CLI source for data or behavior.
- Do not add webfont files, animation libraries, or Tailwind/shadcn solely for restyles when token CSS suffices.
