import path from "node:path";

import { err, ok, type Result } from "../shared/result.js";
import { CoreError } from "../domain/errors.js";
import type { ManagedSkillLink } from "../domain/project-state.js";
import {
  type AtomicJsonFileSystem,
  type AtomicWriteJsonSuccess,
  type AtomicWriteStep,
  readTextFile,
  writeJsonAtomically,
} from "../shared/atomic-json-file.js";

import {
  createEmptyProjectManifest,
  migrateProjectManifestV0,
  parseProjectManifest,
  validateProjectManifest,
  type ProjectManifest,
} from "./manifest-schema.js";

export const PROJECT_MANIFEST_RELATIVE_PATH = path.join(
  ".agents",
  "skillpin.json",
);

export interface ProjectManifestRepositoryOptions {
  readonly filePath: string;
  readonly fileSystem?: AtomicJsonFileSystem;
  readonly onBeforeWriteStep?: (step: AtomicWriteStep) => void | Promise<void>;
}

export interface ProjectManifestSaveInput {
  readonly baseRevision: number;
  readonly managedSkills: readonly ManagedSkillLink[];
}

export type ProjectManifestLoad =
  | { readonly kind: "loaded"; readonly value: ProjectManifest }
  | {
      readonly kind: "migrated";
      readonly backupPath: string | null;
      readonly value: ProjectManifest;
    }
  | { readonly kind: "missing"; readonly value: ProjectManifest };

export interface ProjectManifestSaveSuccess extends AtomicWriteJsonSuccess {
  readonly value: ProjectManifest;
}

export function getProjectManifestPath(projectDirectory: string): string {
  return path.join(projectDirectory, PROJECT_MANIFEST_RELATIVE_PATH);
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
        "The project manifest is not valid JSON.",
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
    "The legacy project manifest could not be migrated; the original file was preserved.",
    "SCHEMA_MIGRATION_FAILED",
    { ...error.details, filePath },
    error.retryable,
    error.details.backupPath === undefined ? "retry" : "restore-backup",
  );
}

/** Node-only repository for a project's fixed .agents/skillpin.json manifest. */
export class ProjectManifestRepository {
  private readonly filePath: string;
  private readonly fileSystem: AtomicJsonFileSystem | undefined;
  private readonly onBeforeWriteStep:
    ((step: AtomicWriteStep) => void | Promise<void>) | undefined;

  public constructor(options: ProjectManifestRepositoryOptions) {
    this.filePath = options.filePath;
    this.fileSystem = options.fileSystem;
    this.onBeforeWriteStep = options.onBeforeWriteStep;
  }

  /** Loads without creating a missing manifest and migrates valid v0 input. */
  public async load(): Promise<Result<ProjectManifestLoad, CoreError>> {
    const contents = await readTextFile(this.filePath, this.fileSystem);
    if (!contents.ok) {
      return contents;
    }
    if (contents.value.kind === "missing") {
      return ok({ kind: "missing", value: createEmptyProjectManifest() });
    }

    const json = parseJson(contents.value.text, this.filePath);
    if (!json.ok) {
      return json;
    }
    const parsed = parseProjectManifest(json.value);
    if (!parsed.ok) {
      return err(withFilePath(parsed.error, this.filePath));
    }
    if (parsed.value.kind === "current") {
      return ok({ kind: "loaded", value: parsed.value.value });
    }

    const value = migrateProjectManifestV0(parsed.value.value);
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
   * Advances the persisted revision exactly once after verifying the caller's
   * base revision against the current on-disk document.
   */
  public async save(
    input: ProjectManifestSaveInput,
  ): Promise<Result<ProjectManifestSaveSuccess, CoreError>> {
    if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0) {
      return err(
        new CoreError(
          "The project manifest base revision must be a non-negative integer.",
          "INVALID_PROJECT_MANIFEST",
          { fieldPath: "baseRevision", filePath: this.filePath },
          false,
          "review-state",
        ),
      );
    }

    const candidate = {
      managedSkills: input.managedSkills,
      revision: input.baseRevision,
      schemaVersion: 1,
    } as const;
    const valid = validateProjectManifest(candidate);
    if (!valid.ok) {
      return err(withFilePath(valid.error, this.filePath));
    }

    const current = await this.load();
    if (!current.ok) {
      return current;
    }
    if (current.value.value.revision !== input.baseRevision) {
      return err(
        new CoreError(
          "The project manifest changed before this update could be saved.",
          "REVISION_CONFLICT",
          { filePath: this.filePath },
          true,
          "review-state",
        ),
      );
    }

    const value: ProjectManifest = {
      managedSkills: valid.value.managedSkills,
      revision: input.baseRevision + 1,
      schemaVersion: 1,
    };
    const written = await writeJsonAtomically({
      filePath: this.filePath,
      fileSystem: this.fileSystem,
      onBeforeStep: this.onBeforeWriteStep,
      value,
    });
    return written.ok ? ok({ ...written.value, value }) : written;
  }
}
