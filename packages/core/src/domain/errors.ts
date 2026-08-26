import { SkillPinError } from "../shared/result.js";

export type RecoveryAction =
  | "create-file"
  | "fix-file"
  | "restore-backup"
  | "retry"
  | "upgrade-skillpin"
  | "review-state"
  | "edit-source"
  | "choose-directory"
  | "manual-recovery";

export type CoreErrorCode =
  | "ATOMIC_WRITE_FAILED"
  | "FILE_READ_FAILED"
  | "INVALID_PROJECT_MANIFEST"
  | "INVALID_STATE_TRANSITION"
  | "INVALID_USER_CONFIG"
  | "JSON_PARSE_FAILED"
  | "REVISION_CONFLICT"
  | "SCHEMA_MIGRATION_FAILED"
  | "SCHEMA_VERSION_UNSUPPORTED"
  | "SOURCE_DUPLICATE"
  | "SOURCE_INVALID"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_UNREADABLE"
  | "DIRECTORY_UNREADABLE"
  | "CHANGESET_INVALID"
  | "PROJECT_APPLY_IN_PROGRESS"
  | "PROJECT_NOT_DIRECTORY"
  | "PROJECT_STRUCTURE_CONFLICT"
  | "PROJECT_STATE_CONFLICT"
  | "TRANSACTION_FAILED";

export interface CoreErrorDetails {
  readonly backupPath?: string;
  readonly fieldPath?: string;
  readonly filePath?: string;
  readonly recoveryPaths?: readonly string[];
  readonly sourceId?: string;
  readonly sourcePath?: string;
  readonly systemCode?: string;
  readonly requestId?: string;
  readonly linkName?: string;
  readonly transactionStep?: string;
}

export interface SerializedSkillPinError {
  readonly code: string;
  readonly details: CoreErrorDetails;
  readonly message: string;
  readonly recoveryAction: RecoveryAction;
  readonly retryable: boolean;
}

/** A stable, caller-safe error for domain validation and local persistence. */
export class CoreError extends SkillPinError {
  declare public readonly code: CoreErrorCode;

  public constructor(
    message: string,
    code: CoreErrorCode,
    public readonly details: CoreErrorDetails = {},
    public readonly retryable = false,
    public readonly recoveryAction: RecoveryAction = "review-state",
  ) {
    super(message, code);
  }
}

/** Converts expected errors into the local API-safe contract used by later layers. */
export function serializeSkillPinError(
  error: SkillPinError,
): SerializedSkillPinError {
  if (error instanceof CoreError) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
      recoveryAction: error.recoveryAction,
      retryable: error.retryable,
    };
  }

  return {
    code: error.code,
    details: {},
    message: error.message,
    recoveryAction: "retry",
    retryable: false,
  };
}
