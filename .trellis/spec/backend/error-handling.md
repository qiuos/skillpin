# Error Handling

## Current convention

Use the shared `SkillPinError` class for expected domain failures and give each error a stable string code. The root package re-exports the class and its discriminated `Result` helpers from `packages/core/src/shared/result.ts`.

```ts
const error = new SkillPinError("Missing project", "PROJECT_NOT_FOUND");
return err(error);
```

Use `Result<T, E>` for expected, recoverable domain outcomes. Let unexpected programmer errors and operating-system failures retain their original error details until the boundary that can classify or present them.

## Persistence errors

P2 adds `CoreError`, a `SkillPinError` subclass with stable `CoreErrorCode`, typed details (`filePath`, `fieldPath`, backup/recovery paths, and system code where available), retryability, and recovery action. Use `serializeSkillPinError` before a future CLI/API/UI boundary. The persistence contract owns the exact error matrix: [P2 JSON Persistence Contract](./persistence-contract.md).

## Boundary behavior

- Core should define typed errors and return `Result` only for outcomes callers are expected to handle.
- CLI entry points may turn a classified core error into concise terminal output and a non-zero exit status once commands exist.
- Repository scripts fail fast by throwing `Error` when a precondition is violated, as in `scripts/build-package.mjs` and `scripts/verify-package.mjs`.

## Examples

- `packages/core/src/index.ts` sets `this.name = new.target.name`, preserving subclass names.
- `packages/core/src/index.test.ts` verifies an error survives an `err()` result without changing its type.
- `packages/core/src/domain/domain.test.ts` verifies that `CoreError` serializes a stable caller-safe payload.
- `scripts/verify-package.mjs` throws when the expected package archive is missing or malformed.

## Avoid

- Do not encode expected failures as booleans or untyped strings when callers need a reason.
- Do not catch an error only to discard its message, code, or cause.
- Do not expose raw internal stack traces from a future CLI or local HTTP boundary.
