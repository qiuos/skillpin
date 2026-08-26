import type { PlatformLinkType } from "../platform/platform-link-adapter.js";

export interface ManagedSkillLink {
  readonly linkName: string;
  readonly linkType: PlatformLinkType;
  readonly skillRelativePath: string;
  readonly sourceId: string;
  readonly targetFingerprint: string;
}

export type ProjectLinkState =
  "managed" | "manifest-mismatch" | "missing" | "unknown-occupied";

export interface ProjectLinkSnapshot {
  readonly linkName: string;
  readonly managedLink: ManagedSkillLink | null;
  readonly state: ProjectLinkState;
}

export interface ProjectSnapshot {
  readonly links: readonly ProjectLinkSnapshot[];
  readonly manifestRevision: number;
  readonly projectFingerprint: string;
}
