# Implement SkillPin P4 project state, change planning, and link transactions

## Goal

Implement the P4 core workflow defined in the approved SkillPin implementation plan: inspect a project's `.agents/skillpin.json` and `.agents/skills` filesystem state, safely classify managed and unknown content, compute validated add/remove/replace change plans, and apply a change set atomically with revision, idempotency, locking, rollback, and startup-recovery diagnostics.

## Authoritative requirements

- `/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin实施计划.md` — P4 “项目状态识别、变更规划与链接事务”.
- `/Users/qiutao/Documents/obsidian/personal/01.产品/智能体/skillpin/SkillPin产品技术一体化方案.md` — §§4.5–4.6, 5.6–5.7, 7.3–7.4, 8.3–8.5, 9.2–9.3.
- Existing P1/P2/P3 contracts in `@skillpin/core`, especially `PlatformLinkAdapter`, `ProjectManifestRepository`, `ManagedSkillLink`, `ProjectSnapshot`, `PendingChangeSet`, catalog candidates, and stable error handling.

## Requirements

1. Read and validate the project manifest at `.agents/skillpin.json`, inspect the `.agents/skills` directory, and construct a complete project snapshot.
2. Classify every relevant path as a verified managed link, manifest mismatch, missing managed link, unknown link, real directory, ordinary file, or other unknown occupied path. Never infer management from a normal directory.
3. Verify manifest-recorded link type and target fingerprint against the live link, and expose source availability states from the supplied catalog/config data without making project-state inspection depend on scanner internals.
4. Calculate deterministic add, remove, and replace changes from requested candidate selections; reject duplicate/case-folded link-name conflicts, invalid candidates, unknown occupancy, and mismatched managed entries.
5. Validate requests immediately before mutation: normalized project path, expected base revision, request idempotency, project health, target directory validity, and safe live-link conditions.
6. Enforce one in-process mutation at a time per normalized project identity. Stale revisions must be rejected; a previously successful request ID must return its recorded result without performing filesystem changes again.
7. Execute whole change sets using a formal link transaction with project-local temporary names, backups, atomic manifest replacement, reverse-order rollback, clear stable failures, and per-step fault injection support.
8. On startup/inspection, diagnose SkillPin-named temporary/backup artifacts. Do not automatically delete any residue whose ownership or safe recovery cannot be established.
9. Preserve browser safety at the `@skillpin/core` root: Node-only P4 exports remain in a dedicated Node entrypoint.

## Acceptance Criteria

- [x] Real-filesystem integration tests cover add, remove, and replacement behavior.
- [x] Unknown real directories, files, and links are never overwritten, renamed, or deleted.
- [x] Manifest/live-link inconsistencies block write operations.
- [x] Exactly one of two concurrent applies for the same project obtains the in-process lock.
- [x] A stale revision is rejected and a repeated successful request ID does not create links twice or increment the manifest revision twice.
- [x] A failure injected at every transaction phase rolls the project back according to the P1 adapter contract, or returns stable manual-recovery diagnostics when rollback itself cannot be completed.
- [x] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run format:check` pass.

## Technical Approach

- Keep the existing P1 prototype as a reference only; introduce P4 services in `project/` and `changes/` with explicit inputs/outputs that compose existing repositories and the `PlatformLinkAdapter`.
- Use immutable snapshots as the single source for planning and validation. Build the desired selection map by portable `linkName` conflict key, then compare it to verified managed links to produce stable actions.
- Apply each approved action under one project lock. Build a new manifest with `revision + 1`, then use a single multi-operation transaction to stage links, back up existing managed links, atomically replace the manifest, and remove backups only after commit.
- Record completed request IDs in memory per project/session. This satisfies P4 process-local idempotency and deliberately does not add cross-process persistence.
- Return structured, serializable errors and recovery diagnostics; filesystem safety takes precedence over automatic cleanup.

## Decision (ADR-lite)

**Context:** The P4 plan requires both safe whole-change-set application and reuse of P1's per-link transaction contracts. P2 persists only the manifest and P5 will own session/API lifecycle.

**Decision:** Implement P4 as Node-only core services with a project snapshot/classifier, deterministic planner/validator, keyed in-process lock and request-result cache, and a multi-operation link transaction that consumes P1's adapter. Do not put filesystem APIs in the browser-safe package root or persist request IDs in the project manifest.

**Consequences:** P5 can call a narrow project-application service and translate its structured results to API responses. Atomicity is scoped to a single process and the existing filesystem/platform guarantees; cross-process locking and automatic residue repair remain future work.

## Out of Scope

- CLI commands, local HTTP/WebSocket API, sessions, authentication, or UI (P5+).
- Catalog scanning or source configuration behavior beyond consuming their published domain contracts (P3).
- Cross-process locks, durable request-id deduplication, file watching, or multi-project management.
- Automatic deletion/repair of uncertain transaction residue.
- Remote sources, marketplaces, copying directories as a link fallback, or changes to P1's platform policy.

## Technical Notes

- A manifest only stores `sourceId`, safe relative skill path, actual platform link type, and a canonical-target fingerprint; no absolute source paths may be added.
- P4 must retain P1’s protection that a path is removed only when the live link matches the expected link type, canonical target, and fingerprint.
- P3 owns scanning/configuration discovery; P4 uses candidates and does not require its implementation details.
- The approved implementation plan names these primary modules: `project-snapshot-service`, `project-state-classifier`, `project-lock`, `change-planner`, `change-validator`, `link-transaction`, `rollback-journal`, and `recovery-diagnostics`.
