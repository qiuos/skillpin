import { CoreError } from "./errors.js";

export type ChangeKind = "add" | "remove" | "replace";
export type ChangeSetStatus =
  "applied" | "applying" | "draft" | "failed" | "planned";

export interface PendingChange {
  readonly kind: ChangeKind;
  readonly linkName: string;
  readonly replacementCandidateId: string | null;
}

export interface PendingChangeSet {
  readonly baseRevision: number;
  readonly changes: readonly PendingChange[];
  readonly id: string;
  readonly status: ChangeSetStatus;
}

const legalTransitions: Readonly<
  Record<ChangeSetStatus, readonly ChangeSetStatus[]>
> = {
  applied: [],
  applying: ["applied", "failed"],
  draft: ["planned", "failed"],
  failed: [],
  planned: ["applying", "draft", "failed"],
};

export function canTransitionChangeSet(
  from: ChangeSetStatus,
  to: ChangeSetStatus,
): boolean {
  return legalTransitions[from].includes(to);
}

export function transitionChangeSet(
  changeSet: PendingChangeSet,
  to: ChangeSetStatus,
): PendingChangeSet {
  if (!canTransitionChangeSet(changeSet.status, to)) {
    throw new CoreError(
      `A change set cannot transition from ${changeSet.status} to ${to}.`,
      "INVALID_STATE_TRANSITION",
      { fieldPath: "status" },
      false,
      "review-state",
    );
  }

  return { ...changeSet, status: to };
}
