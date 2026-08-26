import type {
  ManagedSkillLink,
  ProjectLinkSnapshot,
  ProjectLinkState,
  ProjectSourceState,
  VerifiedManagedProjectLink,
} from "../domain/project-state.js";
import {
  type LinkInspection,
  type PlatformLinkAdapter,
} from "../platform/platform-link-adapter.js";

export interface ProjectLinkClassificationInput {
  readonly adapter: PlatformLinkAdapter;
  readonly linkName: string;
  readonly linkPath: string;
  readonly managedLink: ManagedSkillLink | null;
  readonly sourceState?: ProjectSourceState | undefined;
}

/** Classifies a live path without treating any unrecorded content as managed. */
export async function classifyProjectLink(
  input: ProjectLinkClassificationInput,
): Promise<ProjectLinkSnapshot> {
  const inspection = await input.adapter.inspectLink(input.linkPath);
  if (!inspection.ok) {
    return {
      linkName: input.linkName,
      managedLink: input.managedLink,
      sourceState: input.sourceState ?? null,
      state: "manifest-mismatch",
      verifiedLink: null,
    };
  }

  const state = classifyInspection(inspection.value, input.managedLink);
  return {
    linkName: input.linkName,
    managedLink: input.managedLink,
    sourceState: input.sourceState ?? null,
    state,
    verifiedLink: state === "managed" ? toVerifiedLink(inspection.value) : null,
  };
}

function classifyInspection(
  inspection: LinkInspection,
  managedLink: ManagedSkillLink | null,
): ProjectLinkState {
  if (managedLink !== null) {
    if (inspection.kind === "missing") {
      return "missing";
    }
    if (inspection.kind !== "link") {
      return "manifest-mismatch";
    }
    if (inspection.dangling) {
      return "dangling-link";
    }
    return inspection.linkType === managedLink.linkType &&
      inspection.targetFingerprint === managedLink.targetFingerprint &&
      inspection.targetPath !== null
      ? "managed"
      : "manifest-mismatch";
  }

  if (inspection.kind === "missing") {
    return "missing";
  }
  if (inspection.kind === "link") {
    return inspection.dangling ? "dangling-link" : "unknown-link";
  }
  return inspection.kind === "directory"
    ? "unknown-directory"
    : inspection.kind === "file"
      ? "unknown-file"
      : "unknown-other";
}

function toVerifiedLink(
  inspection: LinkInspection,
): VerifiedManagedProjectLink {
  if (
    inspection.kind !== "link" ||
    inspection.linkType === "unknown" ||
    inspection.targetFingerprint === null ||
    inspection.targetPath === null
  ) {
    throw new Error("Only a verified managed link can be converted.");
  }
  return {
    linkType: inspection.linkType,
    targetFingerprint: inspection.targetFingerprint,
    targetPath: inspection.targetPath,
  };
}
