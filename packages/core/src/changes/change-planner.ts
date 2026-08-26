import path from "node:path";

import { validateLinkName } from "../catalog/link-name.js";
import type {
  ManagedSkillLink,
  ProjectLinkSnapshot,
  ProjectSnapshot,
} from "../domain/project-state.js";
import { fingerprintTargetPath } from "../platform/target-fingerprint.js";

export interface ProjectSkillCandidate {
  readonly id: string;
  readonly linkName: string;
  readonly skillRelativePath: string;
  readonly sourceId: string;
  /** Canonical, local directory path supplied by the P3 source-catalog boundary. */
  readonly targetPath: string;
}

export interface ProjectSelection {
  readonly candidate: ProjectSkillCandidate | null;
  readonly linkName: string;
}

export type PlannedLinkChange =
  | {
      readonly candidate: ProjectSkillCandidate;
      readonly current: null;
      readonly kind: "add";
      readonly linkName: string;
    }
  | {
      readonly candidate: null;
      readonly current: ProjectLinkSnapshot;
      readonly kind: "remove";
      readonly linkName: string;
    }
  | {
      readonly candidate: ProjectSkillCandidate;
      readonly current: ProjectLinkSnapshot;
      readonly kind: "replace";
      readonly linkName: string;
    };

export interface ChangePlan {
  readonly baseRevision: number;
  readonly blockers: readonly ChangePlanBlocker[];
  readonly changes: readonly PlannedLinkChange[];
}

export interface ChangePlanBlocker {
  readonly code:
    | "DUPLICATE_SELECTION"
    | "INVALID_CANDIDATE"
    | "MANAGED_STATE_MISMATCH"
    | "UNKNOWN_OCCUPIED";
  readonly linkName: string;
  readonly message: string;
}

/** Builds a deterministic pure plan; it never calls the filesystem. */
export function planProjectChanges(
  snapshot: ProjectSnapshot,
  selections: readonly ProjectSelection[],
): ChangePlan {
  const blockers: ChangePlanBlocker[] = [];
  const selectionByKey = new Map<string, ProjectSelection>();
  for (const selection of selections) {
    const key = conflictKey(selection.linkName);
    if (selectionByKey.has(key)) {
      blockers.push({
        code: "DUPLICATE_SELECTION",
        linkName: selection.linkName,
        message: "A project can select only one candidate for each link name.",
      });
      continue;
    }
    if (
      !isSafeLinkName(selection.linkName) ||
      (selection.candidate !== null &&
        (conflictKey(selection.candidate.linkName) !== key ||
          !isSafeLinkName(selection.candidate.linkName) ||
          selection.candidate.sourceId.trim() === "" ||
          !isSafeRelativePath(selection.candidate.skillRelativePath) ||
          !path.isAbsolute(selection.candidate.targetPath)))
    ) {
      blockers.push({
        code: "INVALID_CANDIDATE",
        linkName: selection.linkName,
        message: "The selected candidate does not match a safe project link.",
      });
      continue;
    }
    selectionByKey.set(key, selection);
  }

  const currentByKey = new Map(
    snapshot.links.map((link) => [conflictKey(link.linkName), link]),
  );
  const keys = new Set([...currentByKey.keys(), ...selectionByKey.keys()]);
  const changes: PlannedLinkChange[] = [];
  for (const key of [...keys].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const current = currentByKey.get(key);
    const selection = selectionByKey.get(key);
    if (selection === undefined) {
      continue;
    }
    if (current !== undefined && isWriteBlocked(current)) {
      blockers.push({
        code:
          current.managedLink === null
            ? "UNKNOWN_OCCUPIED"
            : "MANAGED_STATE_MISMATCH",
        linkName: current.linkName,
        message:
          current.managedLink === null
            ? "Unknown project content must not be overwritten or deleted."
            : "The managed link does not match the project manifest.",
      });
      continue;
    }
    if (selection.candidate === null) {
      if (current?.state === "managed") {
        changes.push({
          candidate: null,
          current,
          kind: "remove",
          linkName: current.linkName,
        });
      }
      continue;
    }
    if (current === undefined || current.state === "missing") {
      changes.push({
        candidate: selection.candidate,
        current: null,
        kind: "add",
        linkName: selection.linkName,
      });
      continue;
    }
    if (current.state !== "managed" || current.managedLink === null) {
      continue;
    }
    if (!sameCandidate(current.managedLink, selection.candidate, current)) {
      changes.push({
        candidate: selection.candidate,
        current,
        kind: "replace",
        linkName: current.linkName,
      });
    }
  }
  return { baseRevision: snapshot.manifestRevision, blockers, changes };
}

function isWriteBlocked(snapshot: ProjectLinkSnapshot): boolean {
  return snapshot.state !== "missing" && snapshot.state !== "managed";
}

function sameCandidate(
  managed: ManagedSkillLink,
  candidate: ProjectSkillCandidate,
  snapshot: ProjectLinkSnapshot,
): boolean {
  return (
    managed.sourceId === candidate.sourceId &&
    managed.skillRelativePath === candidate.skillRelativePath &&
    snapshot.verifiedLink?.targetFingerprint ===
      fingerprintTargetPath(candidate.targetPath)
  );
}

function isSafeLinkName(value: string): boolean {
  return validateLinkName(value).ok;
}

function isSafeRelativePath(value: string): boolean {
  if (value.trim() === "" || path.isAbsolute(value)) {
    return false;
  }
  return value
    .split(/[\\/]+/)
    .every((part) => part !== "" && part !== "." && part !== "..");
}

function conflictKey(value: string): string {
  return value.toLocaleLowerCase("en-US");
}
