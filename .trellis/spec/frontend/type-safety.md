# Frontend Type Safety

## Contracts

- Use TypeScript strict mode and React's `react-jsx` transform.
- Import shared domain types and values from the `@skillpin/core` package boundary.
- Do not use `any`, unchecked type assertions, or manually duplicated versions of shared result/error types.
- Keep `document.getElementById("root")!` limited to the known Vite root element; validate nullable DOM lookups elsewhere.

## Good / Base / Bad

```ts
// Good: preserve the shared discriminated type.
const startup = ok({ name: "SkillPin" });

// Bad: discards type guarantees.
const startup: any = { value: { name: "SkillPin" } };
```

## Tests Required

`npm run typecheck` is required for every UI change. Add behavior tests for branches that cannot be proven by types.
