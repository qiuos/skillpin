import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CatalogIndex,
  searchCatalog,
  SkillScanner,
  type SourceScan,
} from "../../packages/core/src/catalog/index.js";
import type { SkillSource } from "../../packages/core/src/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "skillpin-p3-scan-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeSkill(
  root: string,
  directoryName: string,
  contents: string | Uint8Array,
): Promise<string> {
  const directory = path.join(root, directoryName);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), contents);
  return directory;
}

function source(
  id: string,
  displayName: string,
  sourcePath: string,
): SkillSource {
  return { displayName, enabled: true, id, path: sourcePath };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("P3 skill scanning", () => {
  it("stops at skill roots, prevents symlink loops, and retains parser fallbacks", async () => {
    const root = await temporaryDirectory();
    const sourceRoot = path.join(root, "source");
    await mkdir(sourceRoot);
    const parent = await writeSkill(
      sourceRoot,
      "parent-skill",
      "---\nname: Parent\ndescription: Parent description.\n---\n\nSearchable parent body.",
    );
    await writeSkill(
      parent,
      "resources/child-skill",
      "# Must not be scanned\n\nHidden child.",
    );
    await writeSkill(
      sourceRoot,
      "invalid-yaml",
      "---\nname: [broken\n---\n\nFallback after invalid YAML.",
    );
    await writeSkill(
      sourceRoot,
      "no-description",
      "---\nname: No description\n---\n",
    );
    await writeSkill(sourceRoot, "binary", Uint8Array.from([0xff, 0xfe]));
    await symlink(sourceRoot, path.join(sourceRoot, "loop"), "dir");
    const missingLink = path.join(sourceRoot, "missing-link");
    await symlink(path.join(sourceRoot, "missing-target"), missingLink, "dir");

    const result = await new SkillScanner().scan(
      source("source-1", "Personal", sourceRoot),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.value.candidates.map((candidate) => candidate.linkName),
    ).toEqual(["binary", "invalid-yaml", "no-description", "parent-skill"]);
    expect(
      result.value.candidates.find(
        (candidate) => candidate.linkName === "invalid-yaml",
      ),
    ).toMatchObject({
      displayName: "invalid-yaml",
      parseWarning: { code: "INVALID_FRONT_MATTER" },
      summary: "Fallback after invalid YAML.",
    });
    expect(
      result.value.candidates.find(
        (candidate) => candidate.linkName === "no-description",
      ),
    ).toMatchObject({
      parseWarning: { code: "MISSING_DESCRIPTION" },
      summary: "未提供说明",
    });
    expect(
      result.value.candidates.find(
        (candidate) => candidate.linkName === "binary",
      ),
    ).toMatchObject({
      parseWarning: { code: "INVALID_TEXT_ENCODING" },
    });
    expect(
      result.value.candidates.some(
        (candidate) => candidate.linkName === "child-skill",
      ),
    ).toBe(false);
    expect(result.value.candidates[0]?.contentFingerprint).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNREADABLE_DIRECTORY",
          path: missingLink,
          reason: "PATH_NOT_FOUND",
        }),
      ]),
    );
  });

  it("keeps successful source scans when another source fails and searches all fields", async () => {
    const root = await temporaryDirectory();
    const firstSourceRoot = path.join(root, "first");
    const secondSourceRoot = path.join(root, "second");
    await Promise.all([mkdir(firstSourceRoot), mkdir(secondSourceRoot)]);
    await writeSkill(
      firstSourceRoot,
      "review",
      "---\nname: Review tool\ndescription: Inspect changes\n---\n\nDeep matching body.",
    );
    await writeSkill(
      secondSourceRoot,
      "REVIEW",
      "# Team fallback\n\nSecond candidate.",
    );

    const first = source("first", "Personal skills", firstSourceRoot);
    const second = source("second", "Team skills", secondSourceRoot);
    const unavailable = source(
      "missing",
      "Unavailable",
      path.join(root, "missing"),
    );
    const scanner = new SkillScanner();
    const firstResult = await scanner.scan(first);
    const secondResult = await scanner.scan(second);
    const unavailableResult = await scanner.scan(unavailable);
    expect(firstResult.ok && secondResult.ok && !unavailableResult.ok).toBe(
      true,
    );
    if (!firstResult.ok || !secondResult.ok || unavailableResult.ok) {
      return;
    }

    const index = new CatalogIndex();
    index.replaceSourceScan(firstResult.value as SourceScan);
    index.replaceSourceScan(secondResult.value as SourceScan);
    await index.rescan(unavailable, scanner);
    const snapshot = index.snapshot([first, second, unavailable]);

    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0]?.candidates).toHaveLength(2);
    expect(snapshot.failures).toMatchObject([
      { source: { id: "missing" }, error: { code: "SOURCE_UNREADABLE" } },
    ]);
    expect(searchCatalog(snapshot, "deep matching")[0]).toMatchObject({
      matchingCandidateIds: [firstResult.value.candidates[0]?.id],
    });
    expect(searchCatalog(snapshot, "team skills")[0]).toMatchObject({
      matchingCandidateIds: [secondResult.value.candidates[0]?.id],
    });
    expect(
      searchCatalog(snapshot, "review")[0]?.matchingCandidateIds,
    ).toHaveLength(2);
  });
});
