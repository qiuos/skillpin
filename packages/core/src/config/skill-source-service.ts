import { randomUUID } from "node:crypto";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { SourceScan } from "../catalog/catalog-snapshot.js";
import { CoreError } from "../domain/errors.js";
import type { SkillSource } from "../domain/skill-source.js";
import {
  normalizePathForFingerprint,
  systemErrorCode,
} from "../platform/path-normalization.js";
import { err, ok, type Result } from "../shared/result.js";

import type { UserConfig } from "./user-config-schema.js";
import { UserConfigRepository } from "./user-config-repository.js";

export interface CreateSkillSourceInput {
  readonly displayName: string;
  readonly enabled?: boolean;
  readonly path: string;
}

export interface UpdateSkillSourceInput {
  readonly displayName: string;
  readonly enabled?: boolean;
  readonly path: string;
}

export interface SkillSourceScanRunner {
  scan(source: SkillSource): Promise<Result<SourceScan, CoreError>>;
}

export interface SourceMutationScan {
  readonly scan: Result<SourceScan, CoreError>;
  readonly source: SkillSource;
}

export interface SkillSourceServiceOptions {
  readonly createId?: () => string;
  readonly repository: UserConfigRepository;
  readonly resolveDirectory?: (
    directoryPath: string,
  ) => Promise<Result<string, CoreError>>;
}

function sourceError(
  message: string,
  code:
    | "SOURCE_DUPLICATE"
    | "SOURCE_INVALID"
    | "SOURCE_NOT_FOUND"
    | "SOURCE_UNREADABLE",
  details: {
    readonly sourceId?: string;
    readonly sourcePath?: string;
    readonly systemCode?: string;
  },
  retryable = false,
): CoreError {
  return new CoreError(message, code, details, retryable, "edit-source");
}

/** Resolves an existing readable source directory to its canonical real path. */
export async function resolveReadableSourceDirectory(
  directoryPath: string,
): Promise<Result<string, CoreError>> {
  const absolutePath = path.resolve(directoryPath);
  try {
    const directoryStats = await stat(absolutePath);
    if (!directoryStats.isDirectory()) {
      return err(
        sourceError(
          "A skill source must be an existing directory.",
          "SOURCE_INVALID",
          { sourcePath: absolutePath },
        ),
      );
    }

    // Probes readability without inspecting ordinary file contents.
    await readdir(absolutePath);
    return ok(await realpath(absolutePath));
  } catch (error: unknown) {
    return err(
      sourceError(
        "The skill source directory is unavailable or unreadable.",
        "SOURCE_UNREADABLE",
        systemErrorCode(error) === undefined
          ? { sourcePath: absolutePath }
          : { sourcePath: absolutePath, systemCode: systemErrorCode(error)! },
        true,
      ),
    );
  }
}

function normalizedComparisonPath(value: string): string {
  return normalizePathForFingerprint(path.resolve(value));
}

function normalizedInput(
  input: CreateSkillSourceInput | UpdateSkillSourceInput,
): Result<{ readonly displayName: string; readonly path: string }, CoreError> {
  const displayName = input.displayName.trim();
  const sourcePath = input.path.trim();
  if (displayName === "" || sourcePath === "") {
    return err(
      sourceError(
        "Skill source display names and paths must not be empty.",
        "SOURCE_INVALID",
        {},
      ),
    );
  }

  return ok({ displayName, path: sourcePath });
}

/** User-configuration CRUD that validates source directories before persisting. */
export class SkillSourceService {
  private readonly createId: () => string;
  private readonly repository: UserConfigRepository;
  private readonly resolveDirectory: (
    directoryPath: string,
  ) => Promise<Result<string, CoreError>>;

  public constructor(options: SkillSourceServiceOptions) {
    this.createId = options.createId ?? randomUUID;
    this.repository = options.repository;
    this.resolveDirectory =
      options.resolveDirectory ?? resolveReadableSourceDirectory;
  }

  public async list(): Promise<Result<readonly SkillSource[], CoreError>> {
    const config = await this.loadConfig();
    return config.ok ? ok(config.value.sources) : config;
  }

  public async add(
    input: CreateSkillSourceInput,
  ): Promise<Result<SkillSource, CoreError>> {
    const normalized = normalizedInput(input);
    if (!normalized.ok) {
      return normalized;
    }
    const sourcePath = await this.resolveDirectory(normalized.value.path);
    if (!sourcePath.ok) {
      return sourcePath;
    }
    const config = await this.loadConfig();
    if (!config.ok) {
      return config;
    }

    const duplicate = await this.findDuplicate(
      config.value.sources,
      sourcePath.value,
    );
    if (duplicate !== null) {
      return err(
        sourceError(
          "This directory is already configured as a skill source.",
          "SOURCE_DUPLICATE",
          { sourceId: duplicate.id, sourcePath: sourcePath.value },
        ),
      );
    }

    const source: SkillSource = {
      displayName: normalized.value.displayName,
      enabled: input.enabled ?? true,
      id: this.createId(),
      path: sourcePath.value,
    };
    const saved = await this.save({
      ...config.value,
      sources: [...config.value.sources, source],
    });
    return saved.ok ? ok(source) : saved;
  }

  /** Persists a source, then immediately obtains a non-persistent scan outcome. */
  public async addAndScan(
    input: CreateSkillSourceInput,
    scanner: SkillSourceScanRunner,
  ): Promise<Result<SourceMutationScan, CoreError>> {
    const added = await this.add(input);
    return added.ok
      ? ok({ scan: await scanner.scan(added.value), source: added.value })
      : added;
  }

  public async update(
    sourceId: string,
    input: UpdateSkillSourceInput,
  ): Promise<Result<SkillSource, CoreError>> {
    const normalized = normalizedInput(input);
    if (!normalized.ok) {
      return normalized;
    }
    const sourcePath = await this.resolveDirectory(normalized.value.path);
    if (!sourcePath.ok) {
      return sourcePath;
    }
    const config = await this.loadConfig();
    if (!config.ok) {
      return config;
    }
    const existing = config.value.sources.find(
      (source) => source.id === sourceId,
    );
    if (existing === undefined) {
      return err(
        sourceError("The skill source no longer exists.", "SOURCE_NOT_FOUND", {
          sourceId,
        }),
      );
    }

    const duplicate = await this.findDuplicate(
      config.value.sources.filter((source) => source.id !== sourceId),
      sourcePath.value,
    );
    if (duplicate !== null) {
      return err(
        sourceError(
          "This directory is already configured as a skill source.",
          "SOURCE_DUPLICATE",
          { sourceId: duplicate.id, sourcePath: sourcePath.value },
        ),
      );
    }

    const updated: SkillSource = {
      displayName: normalized.value.displayName,
      enabled: input.enabled ?? existing.enabled,
      id: existing.id,
      path: sourcePath.value,
    };
    const saved = await this.save({
      ...config.value,
      sources: config.value.sources.map((source) =>
        source.id === sourceId ? updated : source,
      ),
    });
    return saved.ok ? ok(updated) : saved;
  }

  /** Rebinds a source, then immediately obtains a non-persistent scan outcome. */
  public async updateAndScan(
    sourceId: string,
    input: UpdateSkillSourceInput,
    scanner: SkillSourceScanRunner,
  ): Promise<Result<SourceMutationScan, CoreError>> {
    const updated = await this.update(sourceId, input);
    return updated.ok
      ? ok({ scan: await scanner.scan(updated.value), source: updated.value })
      : updated;
  }

  public async setEnabled(
    sourceId: string,
    enabled: boolean,
  ): Promise<Result<SkillSource, CoreError>> {
    const config = await this.loadConfig();
    if (!config.ok) {
      return config;
    }
    const existing = config.value.sources.find(
      (source) => source.id === sourceId,
    );
    if (existing === undefined) {
      return err(
        sourceError("The skill source no longer exists.", "SOURCE_NOT_FOUND", {
          sourceId,
        }),
      );
    }

    const updated: SkillSource = { ...existing, enabled };
    const saved = await this.save({
      ...config.value,
      sources: config.value.sources.map((source) =>
        source.id === sourceId ? updated : source,
      ),
    });
    return saved.ok ? ok(updated) : saved;
  }

  public async remove(
    sourceId: string,
  ): Promise<Result<SkillSource, CoreError>> {
    const config = await this.loadConfig();
    if (!config.ok) {
      return config;
    }
    const existing = config.value.sources.find(
      (source) => source.id === sourceId,
    );
    if (existing === undefined) {
      return err(
        sourceError("The skill source no longer exists.", "SOURCE_NOT_FOUND", {
          sourceId,
        }),
      );
    }

    const saved = await this.save({
      ...config.value,
      sources: config.value.sources.filter((source) => source.id !== sourceId),
    });
    return saved.ok ? ok(existing) : saved;
  }

  private async findDuplicate(
    sources: readonly SkillSource[],
    sourcePath: string,
  ): Promise<SkillSource | null> {
    const comparisonPath = normalizedComparisonPath(sourcePath);
    for (const source of sources) {
      const resolved = await this.resolveDirectory(source.path);
      const existingPath = resolved.ok
        ? normalizedComparisonPath(resolved.value)
        : normalizedComparisonPath(source.path);
      if (existingPath === comparisonPath) {
        return source;
      }
    }
    return null;
  }

  private async loadConfig(): Promise<Result<UserConfig, CoreError>> {
    const loaded = await this.repository.load();
    return loaded.ok ? ok(loaded.value.value) : loaded;
  }

  private async save(config: UserConfig): Promise<Result<void, CoreError>> {
    const saved = await this.repository.save(config);
    return saved.ok ? ok(undefined) : saved;
  }
}
