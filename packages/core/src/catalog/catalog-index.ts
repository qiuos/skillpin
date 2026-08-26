import type { CoreError } from "../domain/errors.js";
import type { SkillSource } from "../domain/skill-source.js";
import type { Result } from "../shared/result.js";

import { getLinkConflictKey } from "./link-name.js";
import type {
  CatalogSkillGroup,
  CatalogSnapshot,
  CatalogSourceFailure,
  SourceScan,
} from "./catalog-snapshot.js";

export interface SourceScanRunner {
  scan(source: SkillSource): Promise<Result<SourceScan, CoreError>>;
}

function compareCandidates(
  left: SourceScan["candidates"][number],
  right: SourceScan["candidates"][number],
): number {
  return (
    left.sourceId.localeCompare(right.sourceId) ||
    left.relativePath.localeCompare(right.relativePath) ||
    left.id.localeCompare(right.id)
  );
}

/** Builds stable same-name groups from the source scans currently held in memory. */
export function createCatalogSnapshot(
  sources: readonly SkillSource[],
  scans: ReadonlyMap<string, SourceScan>,
  failures: ReadonlyMap<string, CatalogSourceFailure>,
): CatalogSnapshot {
  const enabledSources = sources
    .filter((source) => source.enabled)
    .sort((left, right) => left.id.localeCompare(right.id));
  const sourceScans = enabledSources
    .map((source) => scans.get(source.id))
    .filter((scan): scan is SourceScan => scan !== undefined);
  const groupsByKey = new Map<string, CatalogSkillGroup>();

  for (const scan of sourceScans) {
    for (const candidate of scan.candidates) {
      const conflictKey = getLinkConflictKey(candidate.linkName);
      const existing = groupsByKey.get(conflictKey);
      groupsByKey.set(conflictKey, {
        candidates: [...(existing?.candidates ?? []), candidate].sort(
          compareCandidates,
        ),
        conflictKey,
        linkName: existing?.linkName ?? candidate.linkName,
      });
    }
  }

  return {
    failures: enabledSources
      .map((source) => failures.get(source.id))
      .filter(
        (failure): failure is CatalogSourceFailure => failure !== undefined,
      )
      .sort((left, right) => left.source.id.localeCompare(right.source.id)),
    groups: [...groupsByKey.values()].sort((left, right) =>
      left.conflictKey.localeCompare(right.conflictKey),
    ),
    sourceScans,
  };
}

/** Holds one latest snapshot per source and preserves unrelated data on a failed rescan. */
export class CatalogIndex {
  private readonly failures = new Map<string, CatalogSourceFailure>();
  private readonly scans = new Map<string, SourceScan>();

  public replaceSourceScan(scan: SourceScan): void {
    this.scans.set(scan.source.id, scan);
    this.failures.delete(scan.source.id);
  }

  public recordSourceFailure(source: SkillSource, error: CoreError): void {
    this.failures.set(source.id, { error, source });
  }

  /** Replaces only this source's snapshot; a failure leaves all prior scans intact. */
  public async rescan(
    source: SkillSource,
    scanner: SourceScanRunner,
  ): Promise<Result<SourceScan, CoreError>> {
    const result = await scanner.scan(source);
    if (result.ok) {
      this.replaceSourceScan(result.value);
    } else {
      this.recordSourceFailure(source, result.error);
    }
    return result;
  }

  public removeSource(sourceId: string): void {
    this.scans.delete(sourceId);
    this.failures.delete(sourceId);
  }

  public snapshot(sources: readonly SkillSource[]): CatalogSnapshot {
    return createCatalogSnapshot(sources, this.scans, this.failures);
  }
}
