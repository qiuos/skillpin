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

The shell uses a single global stylesheet imported by `main.tsx` (`packages/web/src/styles.css`). Visual language is a **Boltshift-style soft blue SaaS dashboard**:

- **Tokens**: soft canvas (`--canvas: #f4f5f8` light / `#0f1117` dark), white/raised panels (`--panel`), neutral borders (`--border: #e4e7ec` light), paired `:root[data-theme="light"]` and dark defaults. Primary actions and active chrome use soft blue (`--primary: #4f6ef7`, `--primary-text: #ffffff`).
- **Accent**: product blue (`--accent` / `--accent-hover` / `--accent-soft`) for focus, active pills, selected rows, and links. Semantic hues (`--success` / `--warning` / `--danger`) stay reserved for status badges and alerts only.
- **Type & motion**: system font stack (no webfont packages); CSS-only transitions via `--transition` (~160ms). No motion libraries.
- **Chrome**: top-bar brand + pill/segment nav (`nav[aria-label="SkillPin 功能分区"].top-nav`); no side-nav. Page interiors use heading + KPI summary cards (one solid primary KPI) + rounded content panels (`--radius-card` ~12px, `--radius-panel` ~14px) with soft shadows. Skills keeps the three-column workbench inside the main panel.
- **Contracts to keep when restyling**: existing CSS class names used by TSX/e2e where still referenced, focus-visible rings, skip-link, skills three-column workbench (`.main-content--workbench` full width, no 1040px clamp), and light/dark/system theme via `data-theme` + `skillpin.theme`.

Prefer token/class updates in `styles.css` over new UI kits or CSS-in-JS. Do not replace the soft-blue product accent with monochrome-only chrome without an explicit design task.

## Avoid

- Do not remove semantic headings or accessible labels just to satisfy visual styling.
- Do not add generated build output to source control.
- Do not make Web depend on CLI source for data or behavior.
- Do not add webfont files, animation libraries, or Tailwind/shadcn solely for restyles when token CSS suffices.
