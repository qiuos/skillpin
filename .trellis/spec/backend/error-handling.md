# Backend Error Handling

## Scope / Trigger

P0 adds the shared domain result and error contract for expected failures before file-system and service features are introduced.

## Signatures

```ts
export class SkillPinError extends Error {
  constructor(message: string, readonly code: string);
}

export type Result<T, E extends SkillPinError = SkillPinError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): { readonly ok: true; readonly value: T };
export function err<E extends SkillPinError>(error: E): {
  readonly ok: false;
  readonly error: E;
};
```

## Contracts

- Use `Result` for expected, recoverable domain outcomes once feature code is added.
- `SkillPinError.code` is a stable machine-readable identifier; `message` is safe for user-facing context but must not contain credentials or sensitive paths.
- Preserve the original error object in `err`; do not convert it to an untyped string.

## Validation & Error Matrix

| Situation | Required behavior |
| --- | --- |
| Success | Return `ok(value)`. |
| Expected domain failure | Return `err(new SkillPinError(message, code))`. |
| Programmer error / invariant breach | Throw; do not disguise it as a recoverable result. |
| Unknown caught error at a boundary | Normalize it to a `SkillPinError` with a documented code before exposing it. |

## Good / Base / Bad

```ts
// Good
return err(new SkillPinError("Project was not found.", "PROJECT_NOT_FOUND"));

// Bad: loses the error code and discriminant.
return { error: "Project was not found." };
```

## Tests Required

- Assert both `ok` discriminant branches and error-code preservation.
- For each future error code, test the triggering validation path and the caller-visible result.
