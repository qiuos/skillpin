# Frontend Component Guidelines

## Current Convention

P0 keeps the one-off empty application shell as a local `App` function in `src/main.tsx`. Components use function declarations, semantic HTML, and typed imports from React where needed.

## Accessibility Contract

- Every screen has one meaningful heading and uses native landmarks before adding ARIA roles.
- Labels, state, and status must not rely on color alone.
- Keep the empty shell keyboard-safe: no custom focus behavior is necessary before interactive controls exist.

## Good / Base / Bad

```tsx
// Good: semantic and testable.
<main><section aria-labelledby="app-title"><h1 id="app-title">SkillPin</h1></section></main>

// Bad: a clickable non-semantic control without keyboard behavior.
<div onClick={save}>Save</div>
```

## Tests Required

Use role- and accessible-name-based Playwright locators for visible UI behavior rather than CSS implementation selectors.
