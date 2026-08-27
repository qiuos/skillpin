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

The shell uses a single global stylesheet imported by `main.tsx` (`packages/web/src/styles.css`). Visual language is an **Invoicer-style soft-blue floating SaaS shell**:

- **Tokens**: deep blue outer canvas (`--canvas: #1e4fd6` light / `#07153a` dark) with soft geometric glow; floating app shell (`--shell`) and raised panels (`--panel`); neutral borders; paired `:root[data-theme="light"]` and dark defaults. Primary actions use soft blue (`--primary: #4f6ef7`, `--primary-text: #ffffff`). Shell radius `--radius-shell` (~24px) with `--shadow-shell`.
- **Accent**: product blue (`--accent` / `--accent-hover` / `--accent-soft`) for focus, active nav, selected rows, and links. Semantic hues (`--success` / `--warning` / `--danger`) stay reserved for status badges and alerts only.
- **Type & motion**: system font stack (no webfont packages); CSS-only transitions/animations via `--transition` (~180ms) plus a short shell entrance. No motion libraries. Honor `prefers-reduced-motion`.
- **Chrome**: outer canvas + floating `.app-shell`; left `.side-nav` brand + section nav (`nav[aria-label="SkillPin 功能分区"]`); `.app-topbar` greeting/title + project chip + session actions. Page interiors use KPI summary cards (one solid primary KPI) + rounded content panels (`--radius-card` ~14px, `--radius-panel` ~18px). Skills keeps the three-column workbench inside the main panel.
- **Contracts to keep when restyling**: accessible names used by e2e, focus-visible rings, skip-link, skills three-column workbench (`.main-content--workbench` full width, no content-width clamp), and light/dark/system theme via `data-theme` + `skillpin.theme`.

Prefer token/class updates in `styles.css` over new UI kits or CSS-in-JS. Do not collapse back to a top-only Boltshift pill chrome or monochrome-only accent without an explicit design task.

## Avoid

- Do not remove semantic headings or accessible labels just to satisfy visual styling.
- Do not add generated build output to source control.
- Do not make Web depend on CLI source for data or behavior.
- Do not add webfont files, animation libraries, or Tailwind/shadcn solely for restyles when token CSS suffices.
