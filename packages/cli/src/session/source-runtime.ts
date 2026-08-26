import {
  type LocalApiError,
  type LocalCatalogCandidate,
  type LocalCatalogCandidateDetail,
  type LocalCatalogGroup,
  type LocalCatalogResponse,
  type LocalDirectoryBrowserEntrypoint,
  type LocalDirectoryListing,
  type LocalSkillSource,
  type LocalSourceInput,
  type LocalSourceListResponse,
  type LocalSourcePathValidation,
  type LocalSourceProjectImpact,
  type LocalSourceRemoveResult,
  type LocalSourceScanSummary,
  type LocalSourceSummary,
  type LocalSourceWarning,
  type ProjectSnapshot,
  type Result,
  type SkillSource,
  CoreError,
  err,
  ok,
} from "@skillpin/core";
import type { ProjectSelection } from "@skillpin/core/changes";

import {
  CatalogIndex,
  getDirectoryBrowserEntrypoints,
  listDirectories,
  resolveReadableSourceDirectory,
  SkillScanner,
  SkillSourceService,
  searchCatalog,
  type ScannedSkillCandidate,
  type SourceScan,
} from "@skillpin/core/catalog";
import {
  getUserConfigPath,
  UserConfigRepository,
} from "@skillpin/core/persistence";

function apiError(error: CoreError): LocalApiError {
  return {
    code: error.code,
    message: error.message,
    recoveryAction: error.retryable ? "retry" : "review-state",
    retryable: error.retryable,
  };
}

function scanSummary(scan: SourceScan): LocalSourceScanSummary {
  return {
    skillCount: scan.candidates.length,
    warnings: scan.warnings.map((warning): LocalSourceWarning => ({
      code: warning.code,
      message: warning.message,
      path: warning.path,
    })),
  };
}

function localSource(source: SkillSource): LocalSkillSource {
  return {
    displayName: source.displayName,
    enabled: source.enabled,
    id: source.id,
    path: source.path,
  };
}

export interface SourceRuntimeOptions {
  readonly configFilePath?: string;
  readonly inspectProject: () => Promise<Result<ProjectSnapshot, CoreError>>;
}

/** Owns P7's persistent source configuration and per-session scan snapshot. */
export class SourceRuntime {
  readonly #catalog = new CatalogIndex();
  readonly #inspectProject: () => Promise<Result<ProjectSnapshot, CoreError>>;
  readonly #scanner = new SkillScanner();
  readonly #service: SkillSourceService;
  #initialized: Promise<Result<void, CoreError>> | null = null;
  #recentPaths: string[] = [];
  #sources: readonly SkillSource[] = [];

  public constructor(options: SourceRuntimeOptions) {
    this.#inspectProject = options.inspectProject;
    this.#service = new SkillSourceService({
      repository: new UserConfigRepository({
        filePath: options.configFilePath ?? getUserConfigPath(),
      }),
    });
  }

  public initialize(): Promise<Result<void, CoreError>> {
    this.#initialized ??= this.loadAndScanEnabledSources();
    return this.#initialized;
  }

  public sourceHealth(): readonly {
    readonly enabled: boolean;
    readonly id: string;
  }[] {
    return this.#sources.map((source) => ({
      enabled: source.enabled,
      id: source.id,
    }));
  }

  public async list(): Promise<Result<LocalSourceListResponse, CoreError>> {
    const ready = await this.initialize();
    if (!ready.ok) {
      return ready;
    }
    return ok({ sources: this.#sources.map((source) => this.summary(source)) });
  }

  public async catalog(
    query: string,
  ): Promise<Result<LocalCatalogResponse, CoreError>> {
    const ready = await this.initialize();
    if (!ready.ok) {
      return ready;
    }
    const snapshot = this.#catalog.snapshot(this.#sources);
    return ok({
      groups: searchCatalog(snapshot, query).map(
        ({ group, matchingCandidateIds }) =>
          this.localCatalogGroup(group, matchingCandidateIds),
      ),
      query,
    });
  }

  public async catalogCandidate(
    candidateId: string,
  ): Promise<Result<LocalCatalogCandidateDetail, CoreError>> {
    const ready = await this.initialize();
    if (!ready.ok) {
      return ready;
    }
    const candidate = this.#catalog
      .snapshot(this.#sources)
      .groups.flatMap((group) => group.candidates)
      .find((entry) => entry.id === candidateId);
    if (candidate === undefined) {
      return err(
        new CoreError(
          "The requested skill candidate is no longer available.",
          "CATALOG_CANDIDATE_NOT_FOUND",
          { candidateId },
          false,
          "review-state",
        ),
      );
    }
    return ok({
      ...this.localCatalogCandidate(candidate),
      markdownBody: candidate.markdownBody,
      skillDirectory: candidate.skillDirectory,
      skillFilePath: candidate.skillFilePath,
    });
  }

  public async projectSelections(
    selections: readonly {
      readonly candidateId: string | null;
      readonly linkName: string;
    }[],
  ): Promise<Result<readonly ProjectSelection[], CoreError>> {
    const ready = await this.initialize();
    if (!ready.ok) {
      return ready;
    }
    const candidates = this.#catalog
      .snapshot(this.#sources)
      .groups.flatMap((group) => group.candidates);
    const resolved: ProjectSelection[] = [];
    for (const selection of selections) {
      const candidate =
        selection.candidateId === null
          ? undefined
          : candidates.find((entry) => entry.id === selection.candidateId);
      if (selection.candidateId === null) {
        resolved.push({ candidate: null, linkName: selection.linkName });
        continue;
      }
      if (candidate === undefined) {
        return err(
          new CoreError(
            "The selected skill candidate is no longer available.",
            "CATALOG_CANDIDATE_NOT_FOUND",
            { candidateId: selection.candidateId },
            false,
            "review-state",
          ),
        );
      }
      resolved.push({
        candidate: {
          id: candidate.id,
          linkName: candidate.linkName,
          skillRelativePath: candidate.relativePath,
          sourceId: candidate.sourceId,
          targetPath: candidate.skillDirectory,
        },
        linkName: selection.linkName,
      });
    }
    return ok(resolved);
  }

  public async validatePath(
    sourcePath: string,
  ): Promise<Result<LocalSourcePathValidation, CoreError>> {
    const resolved = await resolveReadableSourceDirectory(sourcePath.trim());
    return resolved.ok ? ok({ path: resolved.value }) : resolved;
  }

  public entrypoints(): readonly LocalDirectoryBrowserEntrypoint[] {
    return getDirectoryBrowserEntrypoints({ recentPaths: this.#recentPaths });
  }

  public async directories(
    directoryPath: string,
  ): Promise<Result<LocalDirectoryListing, CoreError>> {
    return listDirectories(directoryPath);
  }

  public async add(
    input: LocalSourceInput,
  ): Promise<Result<LocalSourceSummary, CoreError>> {
    const ready = await this.initialize();
    if (!ready.ok) {
      return ready;
    }
    const added = await this.#service.add(input);
    if (!added.ok) {
      return added;
    }
    this.#sources = [...this.#sources, added.value];
    this.rememberPath(added.value.path);
    await this.rescanSource(added.value);
    return ok(this.summary(added.value));
  }

  public async update(
    sourceId: string,
    input: LocalSourceInput,
  ): Promise<Result<LocalSourceSummary, CoreError>> {
    const ready = await this.initialize();
    if (!ready.ok) {
      return ready;
    }
    const updated = await this.#service.update(sourceId, input);
    if (!updated.ok) {
      return updated;
    }
    this.#sources = this.#sources.map((source) =>
      source.id === sourceId ? updated.value : source,
    );
    this.rememberPath(updated.value.path);
    this.#catalog.removeSource(sourceId);
    await this.rescanSource(updated.value);
    return ok(this.summary(updated.value));
  }

  public async rescan(
    sourceId: string,
  ): Promise<Result<LocalSourceSummary, CoreError>> {
    const ready = await this.initialize();
    if (!ready.ok) {
      return ready;
    }
    const source = this.#sources.find((candidate) => candidate.id === sourceId);
    if (source === undefined) {
      return err(
        new CoreError(
          "The skill source no longer exists.",
          "SOURCE_NOT_FOUND",
          { sourceId },
          false,
          "edit-source",
        ),
      );
    }
    await this.rescanSource(source);
    return ok(this.summary(source));
  }

  public async remove(
    sourceId: string,
    confirmed: boolean,
  ): Promise<Result<LocalSourceRemoveResult, CoreError>> {
    const ready = await this.initialize();
    if (!ready.ok) {
      return ready;
    }
    const impact = await this.projectImpact(sourceId);
    if (!impact.ok) {
      return impact;
    }
    if (impact.value.managedLinkCount > 0 && !confirmed) {
      return ok({ impact: impact.value, kind: "impact" });
    }
    const removed = await this.#service.remove(sourceId);
    if (!removed.ok) {
      return removed;
    }
    this.#sources = this.#sources.filter((source) => source.id !== sourceId);
    this.#catalog.removeSource(sourceId);
    return ok({ kind: "removed", source: localSource(removed.value) });
  }

  private async loadAndScanEnabledSources(): Promise<Result<void, CoreError>> {
    const sources = await this.#service.list();
    if (!sources.ok) {
      return sources;
    }
    this.#sources = sources.value;
    await Promise.all(
      this.#sources
        .filter((source) => source.enabled)
        .map((source) => this.rescanSource(source)),
    );
    return ok(undefined);
  }

  private rememberPath(sourcePath: string): void {
    this.#recentPaths = [
      sourcePath,
      ...this.#recentPaths.filter((path) => path !== sourcePath),
    ].slice(0, 8);
  }

  private async rescanSource(source: SkillSource): Promise<void> {
    await this.#catalog.rescan(source, this.#scanner);
  }

  private localCatalogGroup(
    group: {
      readonly candidates: readonly ScannedSkillCandidate[];
      readonly conflictKey: string;
      readonly linkName: string;
    },
    matchingCandidateIds: readonly string[],
  ): LocalCatalogGroup {
    return {
      candidates: group.candidates.map((candidate) =>
        this.localCatalogCandidate(candidate),
      ),
      conflictKey: group.conflictKey,
      linkName: group.linkName,
      matchingCandidateIds,
    };
  }

  private localCatalogCandidate(
    candidate: ScannedSkillCandidate,
  ): LocalCatalogCandidate {
    const source = this.#sources.find(
      (entry) => entry.id === candidate.sourceId,
    );
    return {
      contentFingerprint: candidate.contentFingerprint,
      displayName: candidate.displayName,
      id: candidate.id,
      linkName: candidate.linkName,
      parseWarning: candidate.parseWarning,
      relativePath: candidate.relativePath,
      source: localSource(
        source ?? {
          displayName: candidate.sourceId,
          enabled: true,
          id: candidate.sourceId,
          path: "",
        },
      ),
      summary: candidate.summary,
    };
  }

  private async projectImpact(
    sourceId: string,
  ): Promise<Result<LocalSourceProjectImpact, CoreError>> {
    const project = await this.#inspectProject();
    if (!project.ok) {
      return project;
    }
    return ok({
      managedLinkCount: project.value.links.filter(
        (link) => link.managedLink?.sourceId === sourceId,
      ).length,
      sourceId,
    });
  }

  private summary(source: SkillSource): LocalSourceSummary {
    const scan = this.#catalog.sourceScan(source.id);
    const failure = this.#catalog.sourceFailure(source.id);
    const scanResult = scan === undefined ? null : scanSummary(scan);
    return {
      failure: failure === undefined ? null : apiError(failure.error),
      health: !source.enabled
        ? "disabled"
        : failure !== undefined
          ? "failed"
          : scan === undefined
            ? "unscanned"
            : scan.candidates.length === 0
              ? "no-skills"
              : scan.warnings.length > 0
                ? "warnings"
                : "healthy",
      scan: scanResult,
      source: localSource(source),
    };
  }
}
