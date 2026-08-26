# Database Guidelines

## Current state

SkillPin has no database, ORM, migration tool, or persistent manifest implementation yet. The P0 baseline contains only in-memory values and build/test tooling. Do not introduce database dependencies, migrations, or an ORM incidentally while implementing platform primitives.

## Existing persistence-adjacent conventions

Repository utilities use Node's promise-based filesystem API and derive paths from the module location:

- `scripts/build-package.mjs` uses `node:fs/promises` and `fileURLToPath(import.meta.url)`.
- `scripts/verify-package.mjs` reads the generated archive with `node:fs/promises` and validates it before reporting success.
- Both scripts resolve paths from the repository root rather than relying on the caller's current directory.

## Future persistence work

When the planned user configuration and project manifest are introduced, define their schema and atomic-write behavior in the relevant task before adding storage code. Keep persistence format and filesystem transaction behavior in core; CLI and Web should consume typed core APIs rather than read manifest files independently.

## Avoid

- Do not add a database or migration mechanism before product requirements need one.
- Do not treat an unvalidated JSON file as an authoritative project state.
- Do not depend on process working directory for persisted file locations.
