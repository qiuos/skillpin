# Directory Structure

## Current layout

The browser package is `packages/web`, a Vite + React ESM workspace.

- Start the browser application from `packages/web/src/main.tsx`.
- Keep application-level CSS in `packages/web/src/styles.css` while the UI is still a single shell.
- Keep Vite configuration in `packages/web/vite.config.ts` and browser environment types in `packages/web/src/vite-env.d.ts`.
- Place end-to-end tests in `tests/e2e/`, outside the app source tree; `tests/e2e/app.spec.ts` is the current example.

When the UI gains separate features, create a directory only when a concrete component or feature needs it. The desired long-term folders (`app`, `api`, `components`, `features`, and `styles`) are not pre-created in P0.

## Package boundaries

Web may import stable primitives from `@skillpin/core`, as `packages/web/src/main.tsx` does. It must not import CLI code or its implementation files.

## Avoid

- Do not import files from `packages/cli/src` or cross-package source paths.
- Do not place Playwright tests or generated Vite assets in `src/`.
- Do not add empty feature folders only to follow a future repository sketch.
