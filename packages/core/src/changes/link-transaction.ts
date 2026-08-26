import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { CoreError, type CoreErrorDetails } from "../domain/errors.js";
import type {
  ManagedSkillLink,
  ProjectSnapshot,
} from "../domain/project-state.js";
import {
  type ExpectedManagedLink,
  type ManagedDirectoryLink,
  type PlatformLinkAdapter,
} from "../platform/platform-link-adapter.js";
import {
  type ProjectManifest,
  validateProjectManifest,
} from "../project/manifest-schema.js";
import { ProjectLock } from "../project/project-lock.js";
import { ProjectSnapshotService } from "../project/project-snapshot-service.js";
import {
  projectBackupPath,
  projectTemporaryPath,
} from "../project/recovery-diagnostics.js";
import { err, ok, type Result } from "../shared/result.js";
import {
  planProjectChanges,
  type PlannedLinkChange,
  type ProjectSelection,
} from "./change-planner.js";
import {
  isSafeChangeRequestId,
  validateChangePlan,
} from "./change-validator.js";
import { RollbackJournal, type LinkRollbackEntry } from "./rollback-journal.js";

export type LinkTransactionStep =
  | "stage-links"
  | "backup-links"
  | "promote-links"
  | "write-manifest-temporary"
  | "backup-manifest"
  | "commit-manifest"
  | "discard-backups";

export interface LinkTransactionInput {
  readonly adapter: PlatformLinkAdapter;
  readonly baseRevision: number;
  readonly changes: readonly PlannedLinkChange[];
  readonly manifestPath: string;
  readonly projectDirectory: string;
  readonly requestId: string;
  readonly snapshot: ProjectSnapshot;
  readonly onBeforeStep?:
    ((step: LinkTransactionStep) => void | Promise<void>) | undefined;
}

export interface ProjectLinkTransactionSuccess {
  readonly manifest: ProjectManifest;
  readonly recoveryPaths: readonly string[];
}

export interface LinkTransactionFailure {
  readonly recoveryPaths: readonly string[];
  readonly rollback: "manual-recovery-required" | "restored";
  readonly step: LinkTransactionStep;
}

interface TransactionState {
  readonly input: LinkTransactionInput;
  readonly journal: RollbackJournal;
  readonly manifest: ProjectManifest;
  readonly manifestBackupPath: string;
  readonly manifestTemporaryPath: string;
  manifestBackedUp: boolean;
  manifestCommitted: boolean;
}

/**
 * Applies all safe link mutations and the replacement manifest as one local
 * transaction. A rollback never deletes paths it cannot prove it created.
 */
export async function applyLinkTransaction(
  input: LinkTransactionInput,
): Promise<Result<ProjectLinkTransactionSuccess, CoreError>> {
  if (!isSafeChangeRequestId(input.requestId)) {
    return err(
      new CoreError(
        "A change request requires a safe request id.",
        "CHANGESET_INVALID",
        { fieldPath: "requestId", requestId: input.requestId },
        false,
        "review-state",
      ),
    );
  }
  const manifest = createNextManifest(input);
  if (!manifest.ok) {
    return manifest;
  }
  const state: TransactionState = {
    input,
    journal: new RollbackJournal(),
    manifest: manifest.value,
    manifestBackupPath: projectBackupPath(input.manifestPath, input.requestId),
    manifestTemporaryPath: projectTemporaryPath(
      input.manifestPath,
      input.requestId,
    ),
    manifestBackedUp: false,
    manifestCommitted: false,
  };

  try {
    await mkdir(path.join(input.projectDirectory, ".agents", "skills"), {
      recursive: true,
    });
    await beforeStep(input, "stage-links");
    await stageLinks(state);
    await beforeStep(input, "backup-links");
    await backupLinks(state);
    await beforeStep(input, "promote-links");
    await promoteLinks(state);
    await beforeStep(input, "write-manifest-temporary");
    await writeManifestTemporary(state);
    await beforeStep(input, "backup-manifest");
    await backupManifest(state);
    await beforeStep(input, "commit-manifest");
    await commitManifest(state);
    await beforeStep(input, "discard-backups");
    await discardBackups(state);
    return ok({
      manifest: state.manifest,
      recoveryPaths: recoveryPaths(state),
    });
  } catch (error: unknown) {
    const step = currentStep(error);
    const rollback = await rollbackTransaction(state);
    return err(
      new CoreError(
        "The project change transaction failed.",
        "TRANSACTION_FAILED",
        transactionErrorDetails(input, rollback.paths, step, error),
        rollback.status === "restored",
        rollback.status === "restored" ? "review-state" : "manual-recovery",
      ),
    );
  }
}

export interface ApplyProjectChangesInput {
  readonly baseRevision: number;
  readonly requestId: string;
  readonly selections: readonly ProjectSelection[];
}

export interface ApplyProjectChangesSuccess {
  readonly idempotent: boolean;
  readonly manifest: ProjectManifest;
  readonly snapshot: ProjectSnapshot;
}

/** P4 orchestration boundary for P5: lock, fresh inspection, plan, validate, apply. */
export class ProjectChangeService {
  readonly #adapter: PlatformLinkAdapter;
  readonly #completed = new Map<string, ApplyProjectChangesSuccess>();
  readonly #lock: ProjectLock;
  readonly #snapshotService: ProjectSnapshotService;

  public constructor(options: {
    readonly adapter: PlatformLinkAdapter;
    readonly lock?: ProjectLock | undefined;
    readonly snapshotService: ProjectSnapshotService;
  }) {
    this.#adapter = options.adapter;
    this.#lock = options.lock ?? new ProjectLock();
    this.#snapshotService = options.snapshotService;
  }

  public async apply(
    input: ApplyProjectChangesInput,
  ): Promise<Result<ApplyProjectChangesSuccess, CoreError>> {
    const cacheKey = `${this.#snapshotService.projectDirectory}\u0000${input.requestId}`;
    const completed = this.#completed.get(cacheKey);
    if (completed !== undefined) {
      return ok({ ...completed, idempotent: true });
    }

    const lease = this.#lock.tryAcquire(this.#snapshotService.projectDirectory);
    if (lease === null) {
      return err(
        new CoreError(
          "This project is already applying a change set.",
          "PROJECT_APPLY_IN_PROGRESS",
          { requestId: input.requestId },
          true,
          "retry",
        ),
      );
    }
    try {
      const snapshot = await this.#snapshotService.inspect();
      if (!snapshot.ok) {
        return snapshot;
      }
      const plan = planProjectChanges(snapshot.value, input.selections);
      const valid = validateChangePlan(
        snapshot.value,
        input.baseRevision,
        input.requestId,
        plan,
      );
      if (!valid.ok) {
        return valid;
      }
      if (plan.changes.length === 0) {
        const success: ApplyProjectChangesSuccess = {
          idempotent: false,
          manifest: manifestFromSnapshot(snapshot.value),
          snapshot: snapshot.value,
        };
        this.#completed.set(cacheKey, success);
        return ok(success);
      }
      const transaction = await applyLinkTransaction({
        adapter: this.#adapter,
        baseRevision: input.baseRevision,
        changes: plan.changes,
        manifestPath: path.join(
          this.#snapshotService.projectDirectory,
          ".agents",
          "skillpin.json",
        ),
        projectDirectory: this.#snapshotService.projectDirectory,
        requestId: input.requestId,
        snapshot: snapshot.value,
      });
      if (!transaction.ok) {
        return transaction;
      }
      const refreshed = await this.#snapshotService.inspect();
      if (!refreshed.ok) {
        return refreshed;
      }
      const success: ApplyProjectChangesSuccess = {
        idempotent: false,
        manifest: transaction.value.manifest,
        snapshot: refreshed.value,
      };
      this.#completed.set(cacheKey, success);
      return ok(success);
    } finally {
      lease.release();
    }
  }
}

function manifestFromSnapshot(snapshot: ProjectSnapshot): ProjectManifest {
  return {
    managedSkills: snapshot.links.flatMap((link) =>
      link.managedLink === null ? [] : [link.managedLink],
    ),
    revision: snapshot.manifestRevision,
    schemaVersion: 1,
  };
}

function createNextManifest(
  input: LinkTransactionInput,
): Result<ProjectManifest, CoreError> {
  const entries = new Map<string, ManagedSkillLink>(
    input.snapshot.links
      .filter((link) => link.managedLink !== null)
      .map((link) => [
        conflictKey(link.linkName),
        link.managedLink as ManagedSkillLink,
      ]),
  );
  for (const change of input.changes) {
    const key = conflictKey(change.linkName);
    if (change.kind === "remove") {
      entries.delete(key);
    } else {
      entries.set(key, {
        linkName: change.linkName,
        linkType: "symlink", // replaced after staging using the actual platform result
        skillRelativePath: change.candidate.skillRelativePath,
        sourceId: change.candidate.sourceId,
        targetFingerprint: "0".repeat(64),
      });
    }
  }
  // Actual type/fingerprint values are populated during staging below. This
  // early validation only protects the unchanged manifest records.
  const candidate = {
    managedSkills: [...entries.values()],
    revision: input.baseRevision + 1,
    schemaVersion: 1,
  };
  return validateProjectManifest(candidate);
}

async function stageLinks(state: TransactionState): Promise<void> {
  for (const change of state.input.changes) {
    if (change.kind === "remove") {
      continue;
    }
    const finalPath = linkPath(state, change.linkName);
    const temporaryPath = projectTemporaryPath(
      finalPath,
      state.input.requestId,
    );
    const created = await state.input.adapter.createDirectoryLink({
      linkPath: temporaryPath,
      targetPath: change.candidate.targetPath,
    });
    if (!created.ok) {
      throw stepError("stage-links", created.error);
    }
    state.journal.record({
      backupPath: null,
      createdLink: created.value,
      finalPath,
      originalLink: originalLink(change),
      temporaryPath,
    });
    replaceManifestEntry(state.manifest, change, created.value);
  }
}

async function backupLinks(state: TransactionState): Promise<void> {
  for (const change of state.input.changes) {
    if (change.kind === "add") {
      continue;
    }
    const original = originalLink(change);
    if (original === null) {
      throw stepError(
        "backup-links",
        new Error("Missing verified managed link."),
      );
    }
    const finalPath = linkPath(state, change.linkName);
    const backupPath = projectBackupPath(finalPath, state.input.requestId);
    const renamed = await state.input.adapter.renameLink(finalPath, backupPath);
    if (!renamed.ok) {
      throw stepError("backup-links", renamed.error);
    }
    const existing = state.journal
      .entries()
      .some((entry) => entry.finalPath === finalPath);
    if (existing) {
      // A replacement was already staged; retain its new link and add its backup.
      state.journal.replaceForFinal(finalPath, (entry) => ({
        ...entry,
        backupPath,
        originalLink: original,
      }));
    } else {
      state.journal.record({
        backupPath,
        createdLink: null,
        finalPath,
        originalLink: original,
        temporaryPath: null,
      });
    }
  }
}

async function promoteLinks(state: TransactionState): Promise<void> {
  for (const entry of state.journal.entries()) {
    if (entry.temporaryPath === null) {
      continue;
    }
    const promoted = await state.input.adapter.renameLink(
      entry.temporaryPath,
      entry.finalPath,
    );
    if (!promoted.ok) {
      throw stepError("promote-links", promoted.error);
    }
  }
}

async function writeManifestTemporary(state: TransactionState): Promise<void> {
  await writeFile(
    state.manifestTemporaryPath,
    `${JSON.stringify(state.manifest, null, 2)}\n`,
    "utf8",
  );
}

async function backupManifest(state: TransactionState): Promise<void> {
  if (!(await exists(state.input.manifestPath))) {
    return;
  }
  await rename(state.input.manifestPath, state.manifestBackupPath);
  state.manifestBackedUp = true;
}

async function commitManifest(state: TransactionState): Promise<void> {
  await rename(state.manifestTemporaryPath, state.input.manifestPath);
  state.manifestCommitted = true;
}

async function discardBackups(state: TransactionState): Promise<void> {
  for (const entry of deduplicatedEntries(state)) {
    if (entry.backupPath === null || entry.originalLink === null) {
      continue;
    }
    const removed = await state.input.adapter.removeManagedLink(
      entry.backupPath,
      entry.originalLink,
    );
    if (!removed.ok) {
      throw stepError("discard-backups", removed.error);
    }
  }
  if (state.manifestBackedUp) {
    await rm(state.manifestBackupPath, { force: false });
    state.manifestBackedUp = false;
  }
}

async function rollbackTransaction(state: TransactionState): Promise<{
  readonly paths: readonly string[];
  readonly status: "manual-recovery-required" | "restored";
}> {
  const paths = recoveryPaths(state);
  try {
    if (state.manifestCommitted) {
      await rm(state.input.manifestPath, { force: true });
    }
    if (state.manifestBackedUp) {
      await rename(state.manifestBackupPath, state.input.manifestPath);
      state.manifestBackedUp = false;
    }
    await rm(state.manifestTemporaryPath, { force: true });

    for (const entry of deduplicatedEntries(state)) {
      if (entry.createdLink !== null) {
        const expected = {
          linkType: entry.createdLink.linkType,
          targetFingerprint: entry.createdLink.targetFingerprint,
          targetPath: entry.createdLink.targetPath,
        };
        const removedFinal = await state.input.adapter.removeManagedLink(
          entry.finalPath,
          expected,
        );
        if (
          !removedFinal.ok &&
          removedFinal.error.code !== "MANAGED_LINK_MISMATCH"
        ) {
          throw removedFinal.error;
        }
        if (entry.temporaryPath !== null && !removedFinal.ok) {
          const removedTemporary = await state.input.adapter.removeManagedLink(
            entry.temporaryPath,
            expected,
          );
          if (
            !removedTemporary.ok &&
            removedTemporary.error.code !== "MANAGED_LINK_MISMATCH"
          ) {
            throw removedTemporary.error;
          }
        }
      }
      if (entry.backupPath !== null) {
        const restored = await state.input.adapter.renameLink(
          entry.backupPath,
          entry.finalPath,
        );
        if (!restored.ok) {
          throw restored.error;
        }
      }
    }
    return { paths, status: "restored" };
  } catch {
    return { paths, status: "manual-recovery-required" };
  }
}

function deduplicatedEntries(
  state: TransactionState,
): readonly LinkRollbackEntry[] {
  const entries = new Map<string, LinkRollbackEntry>();
  for (const entry of state.journal.entries()) {
    const previous = entries.get(entry.finalPath);
    entries.set(entry.finalPath, {
      backupPath: entry.backupPath ?? previous?.backupPath ?? null,
      createdLink: entry.createdLink ?? previous?.createdLink ?? null,
      finalPath: entry.finalPath,
      originalLink: entry.originalLink ?? previous?.originalLink ?? null,
      temporaryPath: entry.temporaryPath ?? previous?.temporaryPath ?? null,
    });
  }
  return [...entries.values()].reverse();
}

function replaceManifestEntry(
  manifest: ProjectManifest,
  change: Exclude<PlannedLinkChange, { readonly kind: "remove" }>,
  created: ManagedDirectoryLink,
): void {
  const index = manifest.managedSkills.findIndex(
    (link) => conflictKey(link.linkName) === conflictKey(change.linkName),
  );
  const entry: ManagedSkillLink = {
    linkName: change.linkName,
    linkType: created.linkType,
    skillRelativePath: change.candidate.skillRelativePath,
    sourceId: change.candidate.sourceId,
    targetFingerprint: created.targetFingerprint,
  };
  const values = [...manifest.managedSkills];
  if (index >= 0) {
    values[index] = entry;
  } else {
    values.push(entry);
  }
  // ProjectManifest is readonly at its boundary; transaction-local mutation is
  // isolated by replacing its array through this controlled cast.
  (manifest as { managedSkills: readonly ManagedSkillLink[] }).managedSkills =
    values;
}

function originalLink(change: PlannedLinkChange): ExpectedManagedLink | null {
  if (change.current?.verifiedLink === null || change.current === null) {
    return null;
  }
  const verified = change.current.verifiedLink;
  return verified === null
    ? null
    : {
        linkType: verified.linkType,
        targetFingerprint: verified.targetFingerprint,
        targetPath: verified.targetPath,
      };
}

function linkPath(state: TransactionState, linkName: string): string {
  return path.join(state.input.projectDirectory, ".agents", "skills", linkName);
}

function recoveryPaths(state: TransactionState): readonly string[] {
  return [
    ...deduplicatedEntries(state).flatMap((entry) => [
      ...(entry.temporaryPath === null ? [] : [entry.temporaryPath]),
      ...(entry.backupPath === null ? [] : [entry.backupPath]),
    ]),
    state.manifestTemporaryPath,
    state.manifestBackupPath,
  ];
}

function transactionErrorDetails(
  input: LinkTransactionInput,
  recoveryPaths: readonly string[],
  step: LinkTransactionStep,
  error: unknown,
): CoreErrorDetails {
  const base = {
    recoveryPaths,
    requestId: input.requestId,
    transactionStep: step,
  };
  const systemCode = transactionSystemCode(error);
  return systemCode === undefined ? base : { ...base, systemCode };
}

function transactionSystemCode(error: unknown): string | undefined {
  if (error instanceof TransactionStepError && error.cause instanceof Error) {
    const nested = error.cause as { code?: unknown };
    return typeof nested.code === "string" ? nested.code : undefined;
  }
  return undefined;
}

function currentStep(error: unknown): LinkTransactionStep {
  if (error instanceof TransactionStepError) {
    return error.step;
  }
  return "stage-links";
}

function stepError(
  step: LinkTransactionStep,
  cause: unknown,
): TransactionStepError {
  return new TransactionStepError(step, cause);
}

class TransactionStepError extends Error {
  public constructor(
    readonly step: LinkTransactionStep,
    override readonly cause: unknown,
  ) {
    super(`Link transaction failed during ${step}.`);
  }
}

async function beforeStep(
  input: LinkTransactionInput,
  step: LinkTransactionStep,
): Promise<void> {
  try {
    await input.onBeforeStep?.(step);
  } catch (error: unknown) {
    throw stepError(step, error);
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function conflictKey(value: string): string {
  return value.toLocaleLowerCase("en-US");
}
