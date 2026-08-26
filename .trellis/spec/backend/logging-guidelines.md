# Logging Guidelines

## Current state

There is no runtime logging framework in the P0 baseline. Existing CLI and scripts write only successful, user-facing progress to standard output:

- `packages/cli/src/main.ts` prints the baseline version banner.
- `scripts/build-package.mjs` reports the created archive.
- `scripts/verify-package.mjs` reports verification success.

No structured logger, log directory, telemetry, or error-reporting service exists today.

## Rules until a logger is introduced

- Keep normal command output concise and deterministic so it remains useful to people and test automation.
- Do not add ad-hoc `console.log` debugging to core library code.
- When a future operation needs diagnostics, first define the intended audience (user-facing output, developer diagnostics, or audit record) and the data-sensitivity rules in that task.
- Never log local skill contents, secret values, one-time session tokens, or full absolute paths unless the product requirement expressly needs them and documents the privacy trade-off.

## Avoid

- Do not make a logging library a hidden dependency of basic domain primitives.
- Do not report a failed operation as success merely because a diagnostic message was printed.
