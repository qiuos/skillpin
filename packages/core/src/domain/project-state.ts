import type { PlatformLinkType } from "../platform/platform-link-adapter.js";

/** Persisted management metadata; it deliberately contains no absolute source path. */
export interface ManagedSkillLink {
  readonly linkName: string;
  readonly linkType: PlatformLinkType;
  readonly skillRelativePath: string;
  readonly sourceId: string;
  readonly targetFingerprint: string;
}

export type ProjectLinkState =
  | "dangling-link"
  | "managed"
  | "manifest-mismatch"
  | "missing"
  | "unknown-directory"
  | "unknown-file"
  | "unknown-link"
  | "unknown-other";

export type ProjectSourceState = "available" | "disabled" | "unconfigured";

/** A verified live link, available only after filesystem inspection. */
export interface VerifiedManagedProjectLink {
  readonly linkType: PlatformLinkType;
  readonly targetFingerprint: string;
  readonly targetPath: string;
}

export interface ProjectLinkSnapshot {
  readonly linkName: string;
  readonly managedLink: ManagedSkillLink | null;
  readonly sourceState: ProjectSourceState | null;
  readonly state: ProjectLinkState;
  readonly verifiedLink: VerifiedManagedProjectLink | null;
}

export interface ProjectRecoveryDiagnostic {
  readonly kind: "backup" | "temporary";
  readonly path: string;
  readonly safeToDelete: false;
}

export interface ProjectSnapshot {
  readonly links: readonly ProjectLinkSnapshot[];
  readonly manifestRevision: number;
  readonly projectFingerprint: string;
  readonly recoveryDiagnostics: readonly ProjectRecoveryDiagnostic[];
}
