import type { CatalogSkillGroup, CatalogSnapshot } from "./catalog-snapshot.js";

export interface CatalogSearchResult {
  readonly group: CatalogSkillGroup;
  readonly matchingCandidateIds: readonly string[];
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

/** Searches candidate metadata/body and returns the enclosing same-name group. */
export function searchCatalog(
  snapshot: CatalogSnapshot,
  query: string,
): readonly CatalogSearchResult[] {
  const normalizedQuery = normalizeSearchText(query.trim());
  const sourceNames = new Map(
    snapshot.sourceScans.map((scan) => [
      scan.source.id,
      scan.source.displayName,
    ]),
  );
  const results = snapshot.groups.map((group) => {
    const matchingCandidateIds = group.candidates
      .filter((candidate) => {
        if (normalizedQuery === "") {
          return true;
        }
        const searchable = [
          candidate.displayName,
          candidate.linkName,
          candidate.summary,
          candidate.markdownBody,
          sourceNames.get(candidate.sourceId) ?? "",
          candidate.relativePath,
        ].join("\n");
        return normalizeSearchText(searchable).includes(normalizedQuery);
      })
      .map((candidate) => candidate.id);
    return { group, matchingCandidateIds };
  });

  return results
    .filter((result) => result.matchingCandidateIds.length > 0)
    .sort(
      (left, right) =>
        right.matchingCandidateIds.length - left.matchingCandidateIds.length ||
        left.group.conflictKey.localeCompare(right.group.conflictKey),
    );
}
