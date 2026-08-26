# Database Guidelines

## Current state

SkillPin has no database, ORM, or database migration tool. P2 introduces versioned local JSON persistence for a user configuration and project manifest; it does not justify adding a database dependency, ORM, or generic migration framework.

## Existing persistence-adjacent conventions

Repository utilities use Node's promise-based filesystem API and derive paths from the module location:

- `scripts/build-package.mjs` uses `node:fs/promises` and `fileURLToPath(import.meta.url)`.
- `scripts/verify-package.mjs` reads the generated archive with `node:fs/promises` and validates it before reporting success.
- Both scripts resolve paths from the repository root rather than relying on the caller's current directory.

## Local JSON persistence

- The executable P2 contract is [P2 JSON Persistence Contract](./persistence-contract.md).
- Keep document decoding, migration, and atomic replacement in `@skillpin/core/persistence`; CLI/Web must not read or write the JSON files independently.
- Constructors take explicit paths. Future platform location discovery belongs to P3, not repository defaults or `process.cwd()`.
- A missing file is an in-memory default, not a side effect. Corrupt and future-version JSON remain untouched.
- Project manifests persist no source path: only source identity, safe relative skill path, link metadata, and fingerprint.

## Future persistence work

New persisted fields require a schema-version decision, runtime decoder update, migration proof where applicable, backup/failure tests, and an update to the P2 contract. Keep persistence format and filesystem transaction behavior in core; CLI and Web consume typed core APIs rather than read manifest files independently.

## Avoid

- Do not add a database or migration mechanism before product requirements need one.
- Do not treat an unvalidated JSON file as an authoritative project state.
- Do not depend on process working directory for persisted file locations.
