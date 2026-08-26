# Type Safety

## Compiler baseline

`packages/web/tsconfig.json` extends the root strict TypeScript profile and adds React/Vite settings: `jsx: "react-jsx"`, `module: "ESNext"`, and `moduleResolution: "Bundler"`. Keep the strict root checks enabled.

## Rules

- Let TypeScript infer local implementation details when the inferred type is clear, as in the `application` constant in `packages/web/src/main.tsx`.
- Define explicit exported props, shared UI contracts, and API payload types at their owning boundary.
- Reuse domain types exported from `@skillpin/core`; do not reproduce result/error shapes in Web.
- Narrow nullable DOM lookups before using them. The current root element is known by the Vite HTML shell and uses the non-null assertion once at the application bootstrap boundary.

## Avoid

- Do not use `any` to bridge incomplete API design.
- Do not loosen root compiler options for a component-level issue.
- Do not import types from another package's `src/` directory; export them from the owning package.
