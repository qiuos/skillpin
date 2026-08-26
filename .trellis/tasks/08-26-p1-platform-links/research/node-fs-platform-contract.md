# Node Filesystem Platform Contract Research

## Sources

- Confirmed SkillPin implementation plan, P1 “跨平台链接与文件事务风险验证”.
- Confirmed SkillPin product design, sections 8.4, 8.5, and 13.2.
- Node.js filesystem API documentation (reviewed 2026-08-26): `fsPromises.symlink`, `lstat`, `readlink`, and `realpath`.

## Facts that constrain implementation

1. `fsPromises.symlink` accepts a Windows-only `type` of `dir`, `file`, or `junction`; the type is ignored outside Windows.
2. Windows Junction targets need an absolute target path; the API normalizes the target when `junction` is requested, and Junctions can target directories only.
3. `lstat` inspects the link itself, unlike `stat`, which follows the link. A dangling link therefore requires `lstat` before any resolving operation.
4. `readlink` reads symbolic-link text. It must be handled as a best-effort inspection mechanism because the implementation cannot presume identical Junction inspection behavior across all Windows filesystems.
5. `realpath` is appropriate only after a target is known to resolve; it is part of target normalization, not dangling-link detection.

## Implementation decisions

- Use promise-based `node:fs` APIs and Node `path` utilities; do not add a third-party filesystem dependency.
- Treat a managed link as safe to mutate only when its inspected canonical target and link type match the expected managed record.
- Pass absolute, normalized targets for all directory-link creation. Use `dir` for symlinks and `junction` only for Windows fallback.
- Keep temporary and backup items as siblings of the final path so `rename` stays on the same filesystem in the prototype.
- Keep failure injection inside the transaction prototype so tests can exercise each mutation boundary deterministically without relying on host permissions.
- Classify a Windows symlink create failure as fallback-eligible only from a known permission/policy code set; all other errors are returned as failures.
- Do not implement directory-copy fallback under any failure condition.

## Open limitations to expose, not hide

- CI can validate native behavior on its host filesystem; real enterprise Windows group policy, network shares, and every cross-volume variant cannot be fully reproduced locally.
- The P1 prototype will expose stable error classifications and recovery details for future P4 integration rather than claim full product manifest recovery semantics.
