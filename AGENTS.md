<!-- PKQCODE:START -->
# pkqcode

## Source of truth

State and instructions live under `.pkqcode/`: `config.yaml`, `tasks/<MM-DD-slug>/`, `spec/`, `agents/`, and `skills/`. Current task: `config.yaml` → `current_task` or `.pkqcode/current-task`.

Read `.pkqcode/workflow.md` for phase rules, platform contracts and cleanup. Before dispatch, read `.pkqcode/skills/orchestrator/SKILL.md`; load other skills and relevant spec only as needed. Project knowledge starts at `docs/subsystems/README.md`; search or read relevant pages only, never the whole directory by default.

## Responsibility

- **Default: delegate implementation.** Main owns planning, assignment, diagnosis, review and delivery. Only main dispatches; executors never delegate or invent task scope.
- **Main may take over** investigation, small fixes, failed implementation and task/spec/evidence maintenance within existing authorization. Before taking over, stop the previous writer, inspect actual directory/Git status and exact handoff diff, preserve existing work, and record the owner and checks. Use the verified task workspace or the current directory when there is no conflicting writer. Do not silently move or overwrite user changes.
- Takeover is not permission escalation. Respect plan-only mode, user refusals and host permissions; never switch tools or executors to bypass a denial. Ask only when scope, authorization, safety or acceptance needs a user decision.
- Roles: `implement` for non-UI; `frontend` for UI; `check` for independent review and bounded mechanical fixes. UI requires **impeccable**, including main takeover; unavailable means disclose and stop, unless the user explicitly authorizes `impeccable: degraded-by-user`.

## Model tiers

Before dispatch, read `.pkqcode/models.yaml`. Resolve model and thinking from platform overrides, otherwise defaults. Choose tier by difficulty. Verify model and parameters against the current host; obey host restrictions, ask if required capabilities are unavailable, and never silently fall back to `pro`. Record requested and effective values; metadata alone is not execution evidence.

## Workspace and dispatch

- Write-capable delegated implementation and review default to a main-selected isolated linked worktree, one writer at a time. Read-only investigation and simple low-risk tasks may stay in the current project workspace when main explicitly judges isolation unnecessary and records that choice and reason. Preserve unrelated changes; worktrees separate files, not permissions, and do not include main-directory uncommitted changes.
- **Final arguments:** pass the mapped `model` and effort. Write-capable dispatch adds `isolation: "worktree"` (or the platform's prepared-tree equivalent); omit `isolation` only for read-only work or a main-declared simple-task exception. Check actual JSON, not just prompt wording; do not pass a fictional cwd parameter or add nested isolation. Main verifies the actual path, branch, HEAD and diff after the executor reports; the prompt or task record is not proof.
- Task-bound role prompts start with `Active task: .pkqcode/tasks/<slug>/`. A bounded maintenance prompt also names its actual entry and file whitelist. Context injection does not create files or bind directories.
- If the injected task context is absent or unsafe, the role reads the declared task files and relevant spec itself and reports missing requirements instead of inventing them. Before writing, inspect the actual workspace, permissions and existing changes; stop on unexplained divergence from the recorded task progress.
- **Failure handling:** user refusal means no retry. For schema/argument/context errors, inspect the actual request and original error; retry at most once only after a verified correction. Rewording the title/prompt is not a correction. If dispatch remains unavailable, main may take over under the safeguards above or report a concrete blocker. Never repeat an unchanged failed call.
- Native dispatch is the default; `pkqcode run` is an explicit independent-CLI fallback, not proof of native acceptance. Platform details live in the workflow and orchestrator skill. The hook injects context only; these text rules are not runtime guarantees.

## Generated artifacts

Main creates task `cleanup.yaml`; executors register generated file/directory paths and creation-time ownership immediately, including external temp test roots. After merge/checks/writers-stopped/delivery gates, main runs task-scoped `pkqcode clean <slug>`: preview first, then `--yes`; failures retain task evidence for retry. Source/reusable fixtures, shared caches and container engine resources are excluded. No global temp sweep; old `done` tasks without reviewed cleanup records remain retained.

## Completion

- Non-trivial scope needs approval before implementation. Verify changes with relevant tests and `pkqcode verify` before marking a task done; unrun checks are not passes. Distinguish offline tests from real host dispatch evidence.
- Commit, integration, push, release and destructive actions need their corresponding authorization. Cleanup grants none of those permissions.
- After acceptance, commit, integration into `main`, integrated checks and stopped writers, perform mandatory wrap-up without re-asking for this task's own resources, following the workflow checklist. Preserve durable evidence before removing resources; blockers mean `wrap-up incomplete`.
- Historical, unmerged or unowned leftovers: **no auto-delete**. No force, unauthorized unlock, global prune or default branch deletion. `init`/`update` never delete tasks.
<!-- PKQCODE:END -->
