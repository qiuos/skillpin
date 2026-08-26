# Implement SkillPin P3 source configuration and scanning

## Goal

Implement the Node-only source configuration, safe local directory discovery, recursive skill scanning, metadata parsing, grouping, and in-memory search required for SkillPin P3, while preserving the P1/P2 browser-safe core boundary and persistence protections.

## What I already know

- The approved implementation plan explicitly assigns P3 source configuration and scanning to `packages/core` and excludes project transaction and CLI-service work.
- P2 already provides `SkillSource`, `SkillCandidate`, `SkillGroup`, `UserConfigRepository`, strict runtime config validation, and atomic backup-and-replace persistence.
- `@skillpin/core` root exports must remain browser-safe. Node file-system APIs must be exposed only through a dedicated subpath export.
- Product rules define a skill as a directory containing a regular `SKILL.md`, require stop-descending at a skill root, and require canonical-path loop prevention for directory symlinks.

## Requirements

1. Discover the logical user configuration path `skillpin/config.json` using standard OS application-config directories:
   - macOS: `~/Library/Application Support/skillpin/config.json`
   - Windows: `%APPDATA%/skillpin/config.json`
   - Linux: `$XDG_CONFIG_HOME/skillpin/config.json`, falling back to `~/.config/skillpin/config.json`
   The location resolver must accept explicit environment/platform values for deterministic tests.
2. Provide a source service for load, add, edit/rebind, enable, disable, and remove using `UserConfigRepository`.
   - Trim source display names and submitted paths before validation.
   - Require a non-empty display name and an existing readable directory.
   - Canonicalize source paths through their real paths and reject adding/editing a source to a canonical path already used by a different source.
   - Preserve disabled sources in configuration; removal changes configuration only.
   - Generate source IDs through an injectable factory (default UUID) so tests are deterministic.
3. Provide a directory browser that returns only directory metadata, never arbitrary regular-file contents.
   - Support a requested directory listing and separate browser entry points for user home, platform roots, and session-recent directories.
   - Canonicalize/validate browsed directories and give stable source-readable errors for unreadable paths.
4. Scan a configured source recursively.
   - A candidate is only a directory with a regular `SKILL.md` file.
   - Once found, a candidate root is emitted and descendants are not traversed.
   - Resolve every traversed directory to a real path, retain a visited-real-path set, and avoid directory-symlink loops.
   - A root failure is source-local (`SOURCE_UNREADABLE`); scanning other sources must continue.
5. Parse only discovered `SKILL.md` files.
   - Read as UTF-8; invalid encoding becomes an `INVALID_TEXT_ENCODING` candidate warning and does not discard the candidate.
   - Parse an opening YAML front-matter block with maintained YAML support. Invalid YAML becomes `INVALID_FRONT_MATTER` and does not discard the candidate.
   - `name` is the display name with directory-name fallback.
   - `description` is the summary with first readable Markdown paragraph fallback, then `未提供说明` fallback. Missing description must retain a `MISSING_DESCRIPTION` warning unless an earlier parse warning is already present.
   - Retain Markdown body for search/detail consumers.
6. Derive deterministic candidate metadata.
   - `linkName` is the directory basename; it must be a safe single project path segment.
   - Group conflict keys case-fold the valid `linkName`.
   - `contentFingerprint` is lower-case SHA-256 of the raw `SKILL.md` bytes.
   - Candidate identifiers must be stable for a source/canonical relative skill path.
7. Build catalog snapshots in memory.
   - Group candidates by normalized `linkName`, with stable source/candidate ordering.
   - Exclude disabled sources from default scans/searches while retaining their configuration and association identity.
   - Search display name, link/directory name, summary, Markdown body, source display name, and relative path case-insensitively.
   - Return groups for any matching candidate and retain candidate-level match information.
   - A single-source rescan replaces only that source’s snapshot; failure does not erase results for other sources.
8. Export the P3 Node-only APIs through `@skillpin/core/catalog`; do not export them from `@skillpin/core` root.

## Acceptance Criteria

- [ ] Platform config-location mapping is deterministic with injected platform/environment values.
- [ ] Adding, editing, enabling/disabling, and removing sources persists through the P2 repository; the same real path cannot be configured twice.
- [ ] Directory browsing returns directory entries only and does not read arbitrary file content.
- [ ] Platform roots, home directory, and valid session-recent directory entries can be supplied for browsing.
- [ ] Multiple sources scan independently; an unreadable source does not discard results from another source.
- [ ] Directory symlink cycles terminate, and a skill root stops recursive descent into resource subdirectories.
- [ ] YAML parse problems, missing descriptions, and invalid UTF-8 retain candidates with appropriate fallbacks/warnings.
- [ ] Link-name validation, conflict keys, fingerprints, same-name grouping, and all required search fields are stable and covered by tests.
- [ ] `@skillpin/core` root stays browser-safe; P3 Node APIs are package-exported only through `@skillpin/core/catalog`.
- [ ] Formatting, lint, typecheck, tests, build, package verification all pass.

## Definition of Done

- Unit and integration coverage exercises filesystem behavior with temporary directories/fixtures.
- Full repository quality checks pass.
- New P3 contracts and Node-only export boundary are captured in Trellis specs.
- No filesystem watcher, persistent scan cache, marketplace integration, project-link transaction, CLI HTTP route, or browser UI is introduced.

## Technical Approach

- Extend `packages/core` with `config/` and `catalog/` Node-only modules.
- Use `UserConfigRepository` as the only user-config write path.
- Use explicit filesystem interfaces/injected dependencies where they meaningfully make source configuration, scanning, and tests deterministic.
- Add the maintained `yaml` v2 dependency for YAML front-matter parsing; parser diagnostics map to candidate warnings rather than fatal source failures.
- Use Node `realpath`, `readdir({ withFileTypes: true })`, `lstat/stat`, and byte reads to distinguish regular files from links and prevent cycles.
- Build an immutable in-memory catalog snapshot per source, then aggregate it into stable groups and search results.

## Decision (ADR-lite)

**Context**: P3 must parse YAML front matter correctly while accepting malformed content as a non-fatal warning.

**Decision**: Add the maintained `yaml` v2 runtime package and parse a leading `---` YAML block; accept string `name`/`description` metadata only and fallback gracefully on diagnostics.

**Consequences**: Adds a small runtime dependency and avoids a fragile hand-rolled YAML subset. Parser errors remain isolated to one candidate.

## Out of Scope

- Persistent scan cache, file watching, remote marketplaces, or source synchronization.
- CLI CRUD commands, HTTP/WebSocket routes, or browser UI.
- Project state inspection, change planning, link creation, transaction/recovery logic (P4).
- Content rendering or sanitization beyond retaining parsed Markdown text for later consumers.

## Research References

- [`research/yaml-front-matter.md`](research/yaml-front-matter.md) — managed YAML parser and Node filesystem approach.

## Technical Notes

- Product sources: `SkillPin实施计划.md` P3; `SkillPin产品技术一体化方案.md` §§4.3–4.4, 5.3–5.4, 7.2, 9.2–9.3.
- Existing contracts: `packages/core/src/domain/{skill-source,skill-candidate,skill-group}.ts`, `packages/core/src/config/user-config-repository.ts`, `packages/core/src/shared/result.ts`, and `.trellis/spec/backend/persistence-contract.md`.
- P3 needs a new `./catalog` subpath in `packages/core/package.json`; Node-only imports must not enter `packages/core/src/index.ts`.
