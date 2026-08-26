import { access, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { err, ok, type Result, SkillPinError } from "../index.js";
import {
  type ExpectedManagedLink,
  type ManagedDirectoryLink,
  type PlatformLinkAdapter,
  PlatformLinkError,
} from "../platform/platform-link-adapter.js";

export type TransactionStep =
  | "create-temporary-link"
  | "promote-temporary-link"
  | "backup-existing-link"
  | "create-manifest-temporary-file"
  | "backup-existing-manifest"
  | "commit-manifest"
  | "discard-link-backup"
  | "discard-manifest-backup";

export interface ManifestWrite {
  readonly contents: string;
  readonly path: string;
}

interface BaseTransactionRequest {
  readonly adapter: PlatformLinkAdapter;
  readonly linkPath: string;
  readonly manifest: ManifestWrite;
  readonly onBeforeStep?: (step: TransactionStep) => void | Promise<void>;
}

export interface AddLinkTransactionRequest extends BaseTransactionRequest {
  readonly kind: "add";
  readonly targetPath: string;
}

export interface RemoveLinkTransactionRequest extends BaseTransactionRequest {
  readonly expectedLink: ExpectedManagedLink;
  readonly kind: "remove";
}

export interface ReplaceLinkTransactionRequest extends BaseTransactionRequest {
  readonly expectedLink: ExpectedManagedLink;
  readonly kind: "replace";
  readonly targetPath: string;
}

export type LinkTransactionRequest =
  | AddLinkTransactionRequest
  | RemoveLinkTransactionRequest
  | ReplaceLinkTransactionRequest;

export interface LinkTransactionSuccess {
  readonly kind: LinkTransactionRequest["kind"];
  readonly managedLink: ManagedDirectoryLink | null;
}

export interface TransactionRecoveryDetails {
  readonly paths: readonly string[];
  readonly status: "restored" | "manual-recovery-required";
}

export class FileTransactionError extends SkillPinError {
  public constructor(
    message: string,
    code: string,
    public readonly failedStep: TransactionStep,
    public readonly recovery: TransactionRecoveryDetails,
  ) {
    super(message, code);
  }
}

interface TransactionState {
  readonly manifest: ManifestPaths;
  readonly request: LinkTransactionRequest;
  readonly temporaryLinkPath: string;
  readonly linkBackupPath: string;
  createdLink: ManagedDirectoryLink | null;
  linkMovedToBackup: boolean;
  promotedTemporaryLink: boolean;
  manifestBackedUp: boolean;
  manifestCommitted: boolean;
}

interface ManifestPaths {
  readonly backupPath: string;
  readonly existedBefore: boolean;
  readonly path: string;
  readonly temporaryPath: string;
}

/**
 * A fault-injectable filesystem transaction prototype. It keeps all temporary
 * entries next to their final path so every rename is on the same filesystem.
 */
export async function executeLinkTransaction(
  request: LinkTransactionRequest,
): Promise<Result<LinkTransactionSuccess, FileTransactionError>> {
  const state = await createState(request);
  let failedStep: TransactionStep = "create-temporary-link";

  try {
    if (request.kind !== "add") {
      failedStep = "backup-existing-link";
      await beforeStep(request, failedStep);
      const backup = await moveVerifiedLinkToBackup(state);
      if (!backup.ok) {
        throw backup.error;
      }
      state.linkMovedToBackup = true;
    }

    if (request.kind !== "remove") {
      failedStep = "create-temporary-link";
      await beforeStep(request, failedStep);
      const created = await request.adapter.createDirectoryLink({
        linkPath: state.temporaryLinkPath,
        targetPath: request.targetPath,
      });
      if (!created.ok) {
        throw created.error;
      }
      state.createdLink = created.value;

      failedStep = "promote-temporary-link";
      await beforeStep(request, failedStep);
      const promoted = await request.adapter.renameLink(
        state.temporaryLinkPath,
        request.linkPath,
      );
      if (!promoted.ok) {
        throw promoted.error;
      }
      state.promotedTemporaryLink = true;
      state.createdLink = {
        ...state.createdLink,
        linkPath: path.resolve(request.linkPath),
      };
    }

    failedStep = "create-manifest-temporary-file";
    await beforeStep(request, failedStep);
    await writeFile(state.manifest.temporaryPath, request.manifest.contents, {
      encoding: "utf8",
      flush: true,
    });

    if (state.manifest.existedBefore) {
      failedStep = "backup-existing-manifest";
      await beforeStep(request, failedStep);
      await rename(state.manifest.path, state.manifest.backupPath);
      state.manifestBackedUp = true;
    }

    failedStep = "commit-manifest";
    await beforeStep(request, failedStep);
    await rename(state.manifest.temporaryPath, state.manifest.path);
    state.manifestCommitted = true;

    const cleanupFailure = await discardCommittedBackups(state);
    if (cleanupFailure !== null) {
      return err(
        new FileTransactionError(
          "The transaction committed, but a backup requires manual recovery.",
          "TRANSACTION_RECOVERY_REQUIRED",
          cleanupFailure,
          {
            status: "manual-recovery-required",
            paths: [state.linkBackupPath, state.manifest.backupPath],
          },
        ),
      );
    }

    return ok({ kind: request.kind, managedLink: state.createdLink });
  } catch {
    const recovery = await rollback(state);
    return err(
      new FileTransactionError(
        "The link transaction failed.",
        recovery.status === "restored"
          ? "TRANSACTION_FAILED"
          : "TRANSACTION_RECOVERY_REQUIRED",
        failedStep,
        recovery,
      ),
    );
  }
}

async function createState(
  request: LinkTransactionRequest,
): Promise<TransactionState> {
  const manifestPath = path.resolve(request.manifest.path);
  const manifestDirectory = path.dirname(manifestPath);
  const transactionId = randomUUID();

  return {
    request,
    temporaryLinkPath: siblingPath(
      request.linkPath,
      `temporary-link-${transactionId}`,
    ),
    linkBackupPath: siblingPath(
      request.linkPath,
      `backup-link-${transactionId}`,
    ),
    createdLink: null,
    linkMovedToBackup: false,
    promotedTemporaryLink: false,
    manifestBackedUp: false,
    manifestCommitted: false,
    manifest: {
      path: manifestPath,
      temporaryPath: path.join(
        manifestDirectory,
        `.skillpin-manifest-${transactionId}.tmp`,
      ),
      backupPath: path.join(
        manifestDirectory,
        `.skillpin-manifest-${transactionId}.bak`,
      ),
      existedBefore: await pathExists(manifestPath),
    },
  };
}

async function moveVerifiedLinkToBackup(
  state: TransactionState,
): Promise<Result<void, PlatformLinkError>> {
  const expected =
    state.request.kind === "add" ? null : state.request.expectedLink;
  if (expected === null) {
    throw new Error(
      "Only remove and replace transactions move an existing link.",
    );
  }

  const inspection = await state.request.adapter.inspectLink(
    state.request.linkPath,
  );
  if (!inspection.ok) {
    return inspection;
  }

  if (
    inspection.value.kind !== "link" ||
    inspection.value.dangling ||
    inspection.value.linkType !== expected.linkType ||
    inspection.value.targetPath !== expected.targetPath ||
    inspection.value.targetFingerprint !== expected.targetFingerprint
  ) {
    return err(
      new PlatformLinkError(
        "The existing path is not the expected managed link.",
        "MANAGED_LINK_MISMATCH",
        {
          linkPath: path.resolve(state.request.linkPath),
          targetPath: expected.targetPath,
        },
      ),
    );
  }

  return state.request.adapter.renameLink(
    state.request.linkPath,
    state.linkBackupPath,
  );
}

async function discardCommittedBackups(
  state: TransactionState,
): Promise<TransactionStep | null> {
  if (state.linkMovedToBackup) {
    const discarded = await state.request.adapter.removeManagedLink(
      state.linkBackupPath,
      expectedLink(state),
    );
    if (!discarded.ok) {
      return "discard-link-backup";
    }
    state.linkMovedToBackup = false;
  }

  if (state.manifestBackedUp) {
    try {
      await rm(state.manifest.backupPath, { force: false });
      state.manifestBackedUp = false;
    } catch {
      return "discard-manifest-backup";
    }
  }

  return null;
}

function expectedLink(state: TransactionState): ExpectedManagedLink {
  if (state.request.kind === "add") {
    throw new Error("An add transaction has no link backup.");
  }
  return state.request.expectedLink;
}

async function rollback(
  state: TransactionState,
): Promise<TransactionRecoveryDetails> {
  const recoveryPaths = [
    state.temporaryLinkPath,
    state.linkBackupPath,
    state.manifest.temporaryPath,
    state.manifest.backupPath,
  ];

  try {
    if (state.manifestCommitted) {
      await rm(state.manifest.path, { force: true });
    }
    if (state.manifestBackedUp) {
      await rename(state.manifest.backupPath, state.manifest.path);
      state.manifestBackedUp = false;
    }
    await rm(state.manifest.temporaryPath, { force: true });

    if (state.promotedTemporaryLink && state.createdLink !== null) {
      const removed = await state.request.adapter.removeManagedLink(
        state.request.linkPath,
        state.createdLink,
      );
      if (!removed.ok) {
        throw removed.error;
      }
      state.promotedTemporaryLink = false;
    }
    if (!state.promotedTemporaryLink && state.createdLink !== null) {
      const removed = await state.request.adapter.removeManagedLink(
        state.temporaryLinkPath,
        state.createdLink,
      );
      if (!removed.ok && removed.error.code !== "MANAGED_LINK_MISMATCH") {
        throw removed.error;
      }
    }
    if (state.linkMovedToBackup) {
      const restored = await state.request.adapter.renameLink(
        state.linkBackupPath,
        state.request.linkPath,
      );
      if (!restored.ok) {
        throw restored.error;
      }
      state.linkMovedToBackup = false;
    }

    return { status: "restored", paths: recoveryPaths };
  } catch {
    return { status: "manual-recovery-required", paths: recoveryPaths };
  }
}

function siblingPath(finalPath: string, marker: string): string {
  const absolutePath = path.resolve(finalPath);
  return path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.skillpin-${marker}`,
  );
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function beforeStep(
  request: LinkTransactionRequest,
  step: TransactionStep,
): Promise<void> {
  await request.onBeforeStep?.(step);
}
