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

The current shell uses a single global stylesheet imported by `main.tsx`. Preserve its existing color, typography, layout values, and selector scope until a future UI task establishes a component styling system.

## Avoid

- Do not remove semantic headings or accessible labels just to satisfy visual styling.
- Do not add generated build output to source control.
- Do not make Web depend on CLI source for data or behavior.
