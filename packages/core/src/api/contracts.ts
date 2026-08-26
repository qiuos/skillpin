export const LOCAL_API_VERSION = 1 as const;

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type LocalSessionStatus =
  "exiting" | "running" | "starting" | "waiting-to-exit";

/** Session data safe to expose to the page after it authenticates. */
export interface LocalSessionInfo {
  readonly clientCount: number;
  readonly projectDirectory: string;
  readonly projectFingerprint: string;
  readonly sessionId: string;
  readonly status: LocalSessionStatus;
  readonly waitingToExitAt: string | null;
}

export interface BootstrapSessionResponse {
  readonly credential: string;
  readonly credentialExpiresAt: string;
  readonly session: LocalSessionInfo;
}

/** Browser-safe source configuration supplied by P7's protected local API. */
export interface LocalSkillSource {
  readonly displayName: string;
  readonly enabled: boolean;
  readonly id: string;
  readonly path: string;
}

export interface LocalSourceWarning {
  readonly code: "INVALID_LINK_NAME" | "UNREADABLE_DIRECTORY";
  readonly message: string;
  readonly path: string;
}

export interface LocalSourceScanSummary {
  readonly skillCount: number;
  readonly warnings: readonly LocalSourceWarning[];
}

export type LocalSourceHealth =
  "disabled" | "failed" | "healthy" | "no-skills" | "unscanned" | "warnings";

/** A configuration row plus only the scan metadata P7 needs to render safely. */
export interface LocalSourceSummary {
  readonly failure: LocalApiError | null;
  readonly health: LocalSourceHealth;
  readonly scan: LocalSourceScanSummary | null;
  readonly source: LocalSkillSource;
}

export interface LocalSourceListResponse {
  readonly sources: readonly LocalSourceSummary[];
}

/** Read-only candidate metadata suitable for the P8 catalog browser. */
export interface LocalCatalogCandidate {
  readonly contentFingerprint: string | null;
  readonly displayName: string;
  readonly id: string;
  readonly linkName: string;
  readonly parseWarning: {
    readonly code: string;
    readonly message: string;
  } | null;
  readonly relativePath: string;
  readonly source: LocalSkillSource;
  readonly summary: string;
}

export interface LocalCatalogGroup {
  readonly candidates: readonly LocalCatalogCandidate[];
  readonly conflictKey: string;
  readonly linkName: string;
  readonly matchingCandidateIds: readonly string[];
}

/** Search results from the current session-local catalog; never persisted. */
export interface LocalCatalogResponse {
  readonly groups: readonly LocalCatalogGroup[];
  readonly query: string;
}

/** Explicitly requested SKILL.md detail; source content is never sent in list rows. */
export interface LocalCatalogCandidateDetail extends LocalCatalogCandidate {
  readonly markdownBody: string;
  readonly skillDirectory: string;
  readonly skillFilePath: string;
}

export interface LocalSourceInput {
  readonly displayName: string;
  readonly enabled?: boolean;
  readonly path: string;
}

export interface LocalSourcePathValidation {
  readonly path: string;
}

export interface LocalDirectoryBrowserEntrypoint {
  readonly kind: "home" | "recent" | "root";
  readonly label: string;
  readonly path: string;
}

export interface LocalDirectoryEntry {
  readonly name: string;
  readonly path: string;
  readonly realPath: string;
}

export interface LocalDirectoryListing {
  readonly directoryPath: string;
  readonly entries: readonly LocalDirectoryEntry[];
}

export interface LocalSourceProjectImpact {
  readonly managedLinkCount: number;
  readonly sourceId: string;
}

export type LocalSourceRemoveResult =
  | { readonly impact: LocalSourceProjectImpact; readonly kind: "impact" }
  | { readonly kind: "removed"; readonly source: LocalSkillSource };

export interface LocalApiSuccess<T> {
  readonly data: T;
  readonly version: typeof LOCAL_API_VERSION;
}

export interface LocalApiError {
  readonly code: string;
  readonly message: string;
  readonly recoveryAction:
    "manual-recovery" | "open-session" | "retry" | "review-state";
  readonly retryable: boolean;
}

export interface LocalApiFailure {
  readonly error: LocalApiError;
  readonly version: typeof LOCAL_API_VERSION;
}

export type LocalApiResponse<T> = LocalApiFailure | LocalApiSuccess<T>;

/** Ordered state/change notification delivered to authenticated WebSocket pages. */
export interface LocalSessionEvent {
  readonly data: JsonObject;
  readonly sequence: number;
  readonly sessionId: string;
  readonly type: string;
  readonly version: typeof LOCAL_API_VERSION;
}

/** P9 project state kept browser-safe; it contains no filesystem authority. */
export interface LocalProjectLink {
  readonly linkName: string;
  readonly sourceState: "available" | "disabled" | "unconfigured" | null;
  readonly state:
    | "dangling-link"
    | "managed"
    | "manifest-mismatch"
    | "missing"
    | "unknown-directory"
    | "unknown-file"
    | "unknown-link"
    | "unknown-other";
}

export interface LocalProjectSnapshot {
  readonly links: readonly LocalProjectLink[];
  readonly manifestRevision: number;
  readonly recoveryDiagnostics: readonly {
    readonly kind: "backup" | "temporary";
    readonly path: string;
  }[];
}

export interface LocalProjectSelectionInput {
  readonly candidateId: string | null;
  readonly linkName: string;
}

export interface LocalProjectPlanChange {
  readonly candidateId: string | null;
  readonly kind: "add" | "remove" | "replace";
  readonly linkName: string;
}

export interface LocalProjectPlanBlocker {
  readonly code:
    | "DUPLICATE_SELECTION"
    | "INVALID_CANDIDATE"
    | "MANAGED_STATE_MISMATCH"
    | "UNKNOWN_OCCUPIED";
  readonly linkName: string;
  readonly message: string;
}

export interface LocalProjectPlanResponse {
  readonly baseRevision: number;
  readonly blockers: readonly LocalProjectPlanBlocker[];
  readonly changes: readonly LocalProjectPlanChange[];
}

export interface LocalProjectApplyInput {
  readonly baseRevision: number;
  readonly requestId: string;
  readonly selections: readonly LocalProjectSelectionInput[];
}

export interface LocalProjectApplyResponse {
  readonly idempotent: boolean;
  readonly snapshot: LocalProjectSnapshot;
}
