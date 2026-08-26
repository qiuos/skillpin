# Error Handling

## Current convention

Use the shared `SkillPinError` class for expected domain failures and give each error a stable string code. The class and its discriminated `Result` helpers live in `packages/core/src/index.ts`.

```ts
const error = new SkillPinError("Missing project", "PROJECT_NOT_FOUND");
return err(error);
```

Use `Result<T, E>` for expected, recoverable domain outcomes. Let unexpected programmer errors and operating-system failures retain their original error details until the boundary that can classify or present them.

## Boundary behavior

- Core should define typed errors and return `Result` only for outcomes callers are expected to handle.
- CLI entry points may turn a classified core error into concise terminal output and a non-zero exit status once commands exist.
- Repository scripts fail fast by throwing `Error` when a precondition is violated, as in `scripts/build-package.mjs` and `scripts/verify-package.mjs`.

## Examples

- `packages/core/src/index.ts` sets `this.name = new.target.name`, preserving subclass names.
- `packages/core/src/index.test.ts` verifies an error survives an `err()` result without changing its type.
- `scripts/verify-package.mjs` throws when the expected package archive is missing or malformed.

## Avoid

- Do not encode expected failures as booleans or untyped strings when callers need a reason.
- Do not catch an error only to discard its message, code, or cause.
- Do not expose raw internal stack traces from a future CLI or local HTTP boundary.
