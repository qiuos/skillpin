import type {
  SkillCandidate,
  SkillGroup,
  SkillSource,
} from "../domain/index.js";
import type { CoreError } from "../domain/errors.js";

/** A scanned candidate also carries the markdown body needed by catalog search/detail views. */
export interface ScannedSkillCandidate extends SkillCandidate {
  readonly markdownBody: string;
  readonly skillDirectory: string;
  readonly skillFilePath: string;
}

export type SourceScanWarningReason =
  "PATH_NOT_FOUND" | "PERMISSION_DENIED" | "SYMLINK_LOOP" | "UNKNOWN";

export interface SourceScanWarning {
  readonly code: "INVALID_LINK_NAME" | "UNREADABLE_DIRECTORY";
  readonly message: string;
  readonly path: string;
  readonly reason?: SourceScanWarningReason;
}

export interface SourceScan {
  readonly candidates: readonly ScannedSkillCandidate[];
  readonly source: SkillSource;
  readonly warnings: readonly SourceScanWarning[];
}

export interface CatalogSkillGroup extends Omit<SkillGroup, "candidates"> {
  readonly candidates: readonly ScannedSkillCandidate[];
}

export interface CatalogSourceFailure {
  readonly error: CoreError;
  readonly source: SkillSource;
}

/** Immutable in-memory catalog state. Nothing in this type is persisted. */
export interface CatalogSnapshot {
  readonly failures: readonly CatalogSourceFailure[];
  readonly groups: readonly CatalogSkillGroup[];
  readonly sourceScans: readonly SourceScan[];
}
