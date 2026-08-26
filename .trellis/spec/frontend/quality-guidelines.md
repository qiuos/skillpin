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

The shell uses a single global stylesheet imported by `main.tsx` (`packages/web/src/styles.css`). Visual language is a **near black/white Vercel/Stripe product aesthetic**:

- **Tokens**: dark default (`--canvas: #0a0a0a`, `--panel: #111111`, surfaces/borders in neutral grays) and paired `:root[data-theme="light"]` values; primary actions use black/white inversion (`--primary` / `--primary-text`), not a saturated brand blue.
- **Accent**: monochrome (`--accent` tracks near-white in dark / near-black in light). Semantic hues (`--success` / `--warning` / `--danger`) are reserved for status badges and alerts only.
- **Type & motion**: system font stack (no webfont packages); CSS-only transitions via `--transition` (~160ms). No motion libraries.
- **Chrome**: solid panel header (no glass/`backdrop-filter` blur as the primary surface treatment); 6–8px radii; 1px borders; restrained shadows.
- **Contracts to keep when restyling**: existing CSS class names used by TSX/e2e, focus-visible rings, skip-link, skills three-column workbench (`.main-content--workbench` full width, no 1040px clamp), and light/dark/system theme via `data-theme` + `skillpin.theme`.

Prefer token/class updates in `styles.css` over new UI kits or CSS-in-JS. Do not reintroduce a high-saturation blue as the product brand color without an explicit design task.

## Avoid

- Do not remove semantic headings or accessible labels just to satisfy visual styling.
- Do not add generated build output to source control.
- Do not make Web depend on CLI source for data or behavior.
- Do not add webfont files, animation libraries, or Tailwind/shadcn solely for restyles when token CSS suffices.
