# P2: Core domain, schemas, and persistence contracts

## Goal

Implement the P2 foundation that P3–P5 depend on: stable core domain objects and state transitions, runtime-validated user configuration and project manifests, safe atomic JSON persistence with version handling, and serializable stable errors.

## Authoritative requirements

The source of truth is `/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin实施计划.md` P2 and `SkillPin产品技术一体化方案.md` §§3.2, 4.3–4.7, 7.1–7.4, 9.2–9.3, and 12.4.

P2 must:

1. Define typed domain contracts for skill sources, skill candidates, skill groups, managed project links, project snapshots, change sets, and session state.
2. Define state enums and explicit legal transition checks.
3. Define runtime schemas for user configuration and the project manifest.
4. Atomically read, validate, back up, and write JSON without overwriting a corrupt source file.
5. Persist and enforce `schemaVersion`; persist project `revision`.
6. Reject manifests that would store absolute source paths; manifests may contain only `sourceId`, a safe relative skill path, link metadata, and a fingerprint.
7. Define stable domain/persistence error codes and a serializable error payload.
8. Test valid, missing, corrupt, legacy, unsupported-future-version, and migration-failure behavior.

## Scope

### Domain contracts

Create the P2 modules in `packages/core/src/domain/` for:

- `SkillSource`, `SkillCandidate`, and `SkillGroup` data contracts;
- managed project links and project snapshots;
- draft/planned/applying/applied/failed change-set states;
- starting/running/waiting-to-exit/exiting session states;
- typed domain errors, stable codes, error details, and error serialization.

The modules must export testable transition guards. They establish contracts only; scanning, project-state inspection, applying changes, service hosting, and UI behavior remain out of scope.

### Runtime schemas and repositories

Create `packages/core/src/config/`, `packages/core/src/project/`, and `packages/core/src/shared/` modules for:

- user config v1: `{ schemaVersion: 1, preferences: { theme: "system" }, sources: [] }`, with each source containing `id`, `displayName`, local `path`, and `enabled`;
- project manifest v1 at `.agents/skillpin.json`, containing `schemaVersion`, non-negative integer `revision`, and managed-skill records with only `linkName`, `sourceId`, safe `skillRelativePath`, `linkType`, and `targetFingerprint`;
- JSON parsing and runtime validation without adding a schema dependency unless implementation evidence shows one is necessary;
- atomic same-directory temporary-file writes, durable backup creation before replacing an existing valid file, and cleanup after success;
- a deterministic v0-to-v1 migration path for structurally valid legacy JSON, with backup and atomic replacement; migration failures leave the original content intact;
- future schema versions rejected without modification; malformed JSON rejected without a default-file overwrite.

Repository constructors must accept explicit paths so P3 can later supply platform config-location discovery and P4 can supply project directories. No P3 config-location or scanning behavior is included here.

## Acceptance Criteria

- [x] Core exports typed contracts for every P2 domain object and their legal state-transition helpers.
- [x] User configuration and project manifest schemas accept valid v1 documents and reject invalid fields/types/duplicates deterministically.
- [x] A missing configuration or manifest produces a documented deterministic result without writing a file as a side effect.
- [x] Corrupt JSON remains untouched; callers receive a stable serialized error with recovery guidance.
- [x] Unsupported higher `schemaVersion` values are rejected as read-only errors and are never replaced by defaults.
- [x] A valid legacy v0 document migrates to v1 through backup plus atomic replacement; an injected migration/write failure preserves the original document.
- [x] Writes create a same-directory temporary file and a backup of any pre-existing valid document before replacement.
- [x] Project manifests reject absolute and escaping relative skill paths and never serialize the source directory path.
- [x] Project manifest revisions are non-negative integers and can be advanced only by the repository's explicit write contract.
- [x] P1 link types and target fingerprints are reused from `@skillpin/core/platform`; CLI and Web retain the same root domain/error exports.
- [x] New unit/integration tests cover each scenario above, and root lint/typecheck/test/build/format checks pass.

## Technical approach

- Keep browser-safe domain types and serializable errors in the core root export. Keep Node `fs` persistence and repository implementations behind a new Node-only `@skillpin/core/persistence` export so the Web bundle never imports Node modules.
- Use a small handwritten runtime decoder layer. It gives exact error locations and avoids prematurely adding a schema library to the minimal workspace.
- Treat file parsing/validation as read-only. Only validated objects are eligible for migration or write.
- Store no absolute source path in a project manifest. `targetFingerprint` preserves only the one-way P1 target identity.
- Use injectable filesystem primitives/fault hooks only where required to prove migration and atomic-write failure safety.

## Decision (ADR-lite)

**Context:** P2 needs stable schemas and persistence before scanning, transaction planning, and the local service can evolve independently.

**Decision:** Define v1 runtime decoders and a narrowly specified v0-to-v1 migration proof in core, use native Node JSON/filesystem APIs, and expose Node persistence through a dedicated core subpath.

**Consequences:** P3–P5 get one stable contract and can test their own behavior against it. The small local decoder layer must be kept synchronized with exported TypeScript contracts; future schema changes must add explicit migrations rather than silently defaulting data.

## Out of Scope

- Platform config-directory discovery and source CRUD services (P3).
- Directory browsing, scanning, Markdown parsing, catalog indexing, and search (P3).
- Project link inspection, change planning, locking, or transaction orchestration beyond using P1 contracts (P4).
- CLI command parsing, local HTTP/WebSocket service, sessions, browser launch, and authentication (P5).
- Web application behavior and final package distribution.

## Technical Notes

- P1 currently exports `PlatformLinkType` and `fingerprintTargetPath` from `@skillpin/core/platform`; P2 must not duplicate them.
- Existing `SkillPinError`, `Result`, `ok`, and `err` are exported from `packages/core/src/index.ts`. New error contracts must remain compatible with this hierarchy.
- P1's transaction prototype has an atomic manifest replacement proof, but P2 needs reusable, schema-aware JSON persistence rather than reusing a link-transaction-specific API.
- Package boundaries prohibit core from importing CLI/Web; Node-only modules must not enter the browser-safe core root.
