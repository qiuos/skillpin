import { err, ok, type Result } from "../shared/result.js";
import { CoreError } from "../domain/errors.js";
import {
  type AtomicJsonFileSystem,
  type AtomicWriteJsonSuccess,
  type AtomicWriteStep,
  readTextFile,
  writeJsonAtomically,
} from "../shared/atomic-json-file.js";

import {
  createDefaultUserConfig,
  migrateUserConfigV0,
  parseUserConfig,
  validateUserConfig,
  type UserConfig,
} from "./user-config-schema.js";

export interface UserConfigRepositoryOptions {
  readonly filePath: string;
  readonly fileSystem?: AtomicJsonFileSystem;
  readonly onBeforeWriteStep?: (step: AtomicWriteStep) => void | Promise<void>;
}

export type UserConfigLoad =
  | { readonly kind: "loaded"; readonly value: UserConfig }
  | {
      readonly kind: "migrated";
      readonly backupPath: string | null;
      readonly value: UserConfig;
    }
  | { readonly kind: "missing"; readonly value: UserConfig };

export interface UserConfigSaveSuccess extends AtomicWriteJsonSuccess {
  readonly value: UserConfig;
}

function withFilePath(error: CoreError, filePath: string): CoreError {
  return new CoreError(
    error.message,
    error.code,
    { ...error.details, filePath },
    error.retryable,
    error.recoveryAction,
  );
}

function parseJson(text: string, filePath: string): Result<unknown, CoreError> {
  try {
    return ok(JSON.parse(text));
  } catch {
    return err(
      new CoreError(
        "The user configuration is not valid JSON.",
        "JSON_PARSE_FAILED",
        { filePath },
        false,
        "fix-file",
      ),
    );
  }
}

function migrationFailure(error: CoreError, filePath: string): CoreError {
  return new CoreError(
    "The legacy user configuration could not be migrated; the original file was preserved.",
    "SCHEMA_MIGRATION_FAILED",
    { ...error.details, filePath },
    error.retryable,
    error.details.backupPath === undefined ? "retry" : "restore-backup",
  );
}

/** Node-only repository for an explicitly located user configuration file. */
export class UserConfigRepository {
  private readonly filePath: string;
  private readonly fileSystem: AtomicJsonFileSystem | undefined;
  private readonly onBeforeWriteStep:
    ((step: AtomicWriteStep) => void | Promise<void>) | undefined;

  public constructor(options: UserConfigRepositoryOptions) {
    this.filePath = options.filePath;
    this.fileSystem = options.fileSystem;
    this.onBeforeWriteStep = options.onBeforeWriteStep;
  }

  /**
   * Loads configuration without creating a missing file. Valid v0 documents are
   * immediately migrated through the same backup-and-replace write path.
   */
  public async load(): Promise<Result<UserConfigLoad, CoreError>> {
    const contents = await readTextFile(this.filePath, this.fileSystem);
    if (!contents.ok) {
      return contents;
    }
    if (contents.value.kind === "missing") {
      return ok({ kind: "missing", value: createDefaultUserConfig() });
    }

    const json = parseJson(contents.value.text, this.filePath);
    if (!json.ok) {
      return json;
    }
    const parsed = parseUserConfig(json.value);
    if (!parsed.ok) {
      return err(withFilePath(parsed.error, this.filePath));
    }
    if (parsed.value.kind === "current") {
      return ok({ kind: "loaded", value: parsed.value.value });
    }

    const value = migrateUserConfigV0(parsed.value.value);
    const written = await writeJsonAtomically({
      filePath: this.filePath,
      fileSystem: this.fileSystem,
      onBeforeStep: this.onBeforeWriteStep,
      value,
    });
    if (!written.ok) {
      return err(migrationFailure(written.error, this.filePath));
    }

    return ok({
      kind: "migrated",
      backupPath: written.value.backupPath,
      value,
    });
  }

  /**
   * Persists only a runtime-valid v1 document. Calling load first prevents a
   * concurrent corrupt or future-version document from being overwritten.
   */
  public async save(
    config: UserConfig,
  ): Promise<Result<UserConfigSaveSuccess, CoreError>> {
    const valid = validateUserConfig(config);
    if (!valid.ok) {
      return err(withFilePath(valid.error, this.filePath));
    }

    const current = await this.load();
    if (!current.ok) {
      return current;
    }

    const written = await writeJsonAtomically({
      filePath: this.filePath,
      fileSystem: this.fileSystem,
      onBeforeStep: this.onBeforeWriteStep,
      value: valid.value,
    });
    return written.ok ? ok({ ...written.value, value: valid.value }) : written;
  }
}
