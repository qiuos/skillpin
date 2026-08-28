import type {
  CatalogSkillGroup,
  CatalogSnapshot,
  ScannedSkillCandidate,
} from "./catalog-snapshot.js";
import { searchCatalog } from "./search-service.js";

export interface CatalogMatchedSkillGroup extends CatalogSkillGroup {
  readonly matchingCandidateIds: readonly string[];
}

export interface CatalogBrowseSkill {
  readonly group: CatalogMatchedSkillGroup;
  readonly id: string;
  readonly kind: "skill";
}

export interface CatalogBrowseSkillGroup {
  readonly id: string;
  readonly kind: "skill-group";
  readonly name: string;
  readonly skills: readonly CatalogMatchedSkillGroup[];
}

export type CatalogBrowseItem = CatalogBrowseSkill | CatalogBrowseSkillGroup;

function directoryParent(relativePath: string): string | null {
  const segments = relativePath.split("/");
  return segments.length > 1 ? segments.slice(0, -1).join("/") : null;
}

function directoryKey(candidate: ScannedSkillCandidate): string | null {
  const parent = directoryParent(candidate.relativePath);
  return parent === null ? null : `${candidate.sourceId}\u0000${parent}`;
}

function matchedGroup(
  group: CatalogSkillGroup,
  candidates: readonly ScannedSkillCandidate[],
  matchingCandidateIds: ReadonlySet<string>,
): CatalogMatchedSkillGroup {
  return {
    ...group,
    candidates,
    matchingCandidateIds: candidates
      .filter((candidate) => matchingCandidateIds.has(candidate.id))
      .map((candidate) => candidate.id),
  };
}

function skillId(group: CatalogMatchedSkillGroup): string {
  return `skill:${group.conflictKey}:${group.candidates
    .map((candidate) => candidate.id)
    .join(",")}`;
}

/**
 * Builds the browser's flat catalog items from source-relative directories.
 *
 * Same-name candidate groups remain the source-selection unit. A directory is
 * promoted only when one source has two or more immediate child skill roots;
 * outer folders that merely contain nested folders are therefore never shown.
 */
export function buildCatalogBrowseItems(
  snapshot: CatalogSnapshot,
  query: string,
): readonly CatalogBrowseItem[] {
  const matchingCandidateIds = new Set(
    searchCatalog(snapshot, query).flatMap(
      (result) => result.matchingCandidateIds,
    ),
  );
  const candidatesByDirectory = new Map<string, ScannedSkillCandidate[]>();

  for (const scan of snapshot.sourceScans) {
    for (const candidate of scan.candidates) {
      const key = directoryKey(candidate);
      if (key === null) continue;
      const entries = candidatesByDirectory.get(key) ?? [];
      entries.push(candidate);
      candidatesByDirectory.set(key, entries);
    }
  }

  const eligibleDirectoryKeys = new Set(
    [...candidatesByDirectory]
      .filter(([, directoryCandidates]) => directoryCandidates.length >= 2)
      .map(([key]) => key),
  );
  const items: CatalogBrowseItem[] = [];

  for (const group of snapshot.groups) {
    const standaloneCandidates = group.candidates.filter((candidate) => {
      const key = directoryKey(candidate);
      return key === null || !eligibleDirectoryKeys.has(key);
    });
    const standalone = matchedGroup(
      group,
      standaloneCandidates,
      matchingCandidateIds,
    );
    if (standalone.matchingCandidateIds.length > 0) {
      items.push({ group: standalone, id: skillId(standalone), kind: "skill" });
    }
  }

  for (const key of eligibleDirectoryKeys) {
    const skills = snapshot.groups
      .map((group) =>
        matchedGroup(
          group,
          group.candidates.filter(
            (candidate) => directoryKey(candidate) === key,
          ),
          matchingCandidateIds,
        ),
      )
      .filter((group) => group.candidates.length > 0)
      .sort((left, right) => left.linkName.localeCompare(right.linkName));
    if (!skills.some((skill) => skill.matchingCandidateIds.length > 0)) {
      continue;
    }
    const [, parentPath] = key.split("\u0000", 2);
    const name = parentPath!.split("/").at(-1)!;
    items.push({ id: `skill-group:${key}`, kind: "skill-group", name, skills });
  }

  return items.sort((left, right) => {
    const leftMatches =
      left.kind === "skill"
        ? left.group.matchingCandidateIds.length
        : left.skills.reduce(
            (count, skill) => count + skill.matchingCandidateIds.length,
            0,
          );
    const rightMatches =
      right.kind === "skill"
        ? right.group.matchingCandidateIds.length
        : right.skills.reduce(
            (count, skill) => count + skill.matchingCandidateIds.length,
            0,
          );
    const leftName = left.kind === "skill" ? left.group.linkName : left.name;
    const rightName =
      right.kind === "skill" ? right.group.linkName : right.name;
    return (
      rightMatches - leftMatches ||
      leftName.localeCompare(rightName) ||
      left.id.localeCompare(right.id)
    );
  });
}
