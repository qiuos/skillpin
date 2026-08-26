# Hook Guidelines

## Current state

The P0 web shell has no React state or custom hooks. It only renders static content from `packages/web/src/main.tsx` under `StrictMode`.

## Rules for first hooks

- Add a hook only when it encapsulates stateful React behavior shared by more than one component or meaningfully separates data/side-effect logic from rendering.
- Name custom hooks with a `use` prefix and call them only at the top level of React function components or other hooks.
- Keep browser-only side effects and future server/API interaction inside the web package; keep platform filesystem behavior in core behind typed APIs.
- Follow the configured `react-hooks/rules-of-hooks` error and resolve `react-hooks/exhaustive-deps` warnings rather than suppressing them without an explicit rationale.

## Avoid

- Do not create a hook merely to wrap a single static value.
- Do not call hooks conditionally, from event handlers, or from non-React utilities.
- Do not let a hook import CLI implementation code.
