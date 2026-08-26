import { describe, expect, it } from "vitest";

import type { SkillSource } from "../domain/skill-source.js";

import {
  CatalogIndex,
  getDirectoryBrowserEntrypoints,
  getLinkConflictKey,
  getUserConfigPath,
  parseSkillDocument,
  searchCatalog,
  validateLinkName,
  type SourceScan,
} from "./index.js";

const sourceA: SkillSource = {
  displayName: "Personal Source",
  enabled: true,
  id: "source-a",
  path: "/sources/a",
};
const sourceB: SkillSource = {
  displayName: "Team Source",
  enabled: true,
  id: "source-b",
  path: "/sources/b",
};

function scan(
  source: SkillSource,
  candidate: Partial<SourceScan["candidates"][number]>,
): SourceScan {
  return {
    candidates: [
      {
        contentFingerprint: "a".repeat(64),
        displayName: "Code Review",
        id: `${source.id}-candidate`,
        linkName: "code-review",
        markdownBody: "Deep body match text.",
        parseWarning: null,
        relativePath: "review",
        skillDirectory: `${source.path}/review`,
        skillFilePath: `${source.path}/review/SKILL.md`,
        sourceId: source.id,
        summary: "Reviews changes.",
        ...candidate,
      },
    ],
    source,
    warnings: [],
  };
}

describe("P3 catalog primitives", () => {
  it("maps the standard config location for each supported platform", () => {
    expect(
      getUserConfigPath({ homeDirectory: "/Users/pika", platform: "darwin" }),
    ).toBe("/Users/pika/Library/Application Support/skillpin/config.json");
    expect(
      getUserConfigPath({
        environment: { APPDATA: "C:\\Users\\pika\\AppData\\Roaming" },
        homeDirectory: "C:\\Users\\pika",
        platform: "win32",
      }),
    ).toBe("C:\\Users\\pika\\AppData\\Roaming\\skillpin\\config.json");
    expect(
      getUserConfigPath({
        environment: { XDG_CONFIG_HOME: "/tmp/config" },
        homeDirectory: "/home/pika",
        platform: "linux",
      }),
    ).toBe("/tmp/config/skillpin/config.json");
  });

  it("creates safe browser entrypoints without reading file content", () => {
    expect(
      getDirectoryBrowserEntrypoints({
        environment: { SystemDrive: "D:" },
        homeDirectory: "D:\\Users\\pika",
        platform: "win32",
        recentPaths: ["D:\\skills", "D:\\skills", ""],
      }),
    ).toEqual([
      { kind: "home", label: "Home", path: "D:\\Users\\pika" },
      { kind: "root", label: "D:\\", path: "D:\\" },
      { kind: "recent", label: "D:\\skills", path: "D:\\skills" },
    ]);
  });

  it("parses valid YAML, falls back to Markdown, and retains parse warnings", () => {
    expect(
      parseSkillDocument(
        Buffer.from(
          "---\nname: Reviewer\ndescription: Checks code.\n---\n\nBody",
        ),
        "review",
      ),
    ).toMatchObject({
      displayName: "Reviewer",
      markdownBody: "\nBody",
      parseWarning: null,
      summary: "Checks code.",
    });
    expect(
      parseSkillDocument(
        Buffer.from("# Heading\n\nReadable fallback paragraph."),
        "fallback",
      ),
    ).toMatchObject({
      displayName: "fallback",
      parseWarning: null,
      summary: "Readable fallback paragraph.",
    });
    expect(
      parseSkillDocument(
        Buffer.from("---\nname: [broken\n---\n\nBody"),
        "broken",
      ),
    ).toMatchObject({ parseWarning: { code: "INVALID_FRONT_MATTER" } });
    expect(
      parseSkillDocument(Buffer.from([0xff, 0xfe]), "binary"),
    ).toMatchObject({
      parseWarning: { code: "INVALID_TEXT_ENCODING" },
      summary: "未提供说明",
    });
  });

  it("validates portable link names and groups/searches source candidates", () => {
    expect(validateLinkName("review-helper")).toMatchObject({ ok: true });
    expect(validateLinkName("../escape")).toMatchObject({ ok: false });
    expect(getLinkConflictKey("Code-Review")).toBe("code-review");

    const index = new CatalogIndex();
    index.replaceSourceScan(scan(sourceB, { linkName: "CODE-REVIEW" }));
    index.replaceSourceScan(scan(sourceA, {}));
    const snapshot = index.snapshot([sourceB, sourceA]);

    expect(snapshot.groups).toHaveLength(1);
    expect(
      snapshot.groups[0]?.candidates.map((candidate) => candidate.sourceId),
    ).toEqual(["source-a", "source-b"]);
    expect(searchCatalog(snapshot, "team source")[0]).toMatchObject({
      matchingCandidateIds: ["source-b-candidate"],
    });
    expect(searchCatalog(snapshot, "deep body")[0]).toMatchObject({
      matchingCandidateIds: ["source-a-candidate", "source-b-candidate"],
    });

    const disabledSnapshot = index.snapshot([
      { ...sourceA, enabled: false },
      sourceB,
    ]);
    expect(
      disabledSnapshot.groups[0]?.candidates.map(
        (candidate) => candidate.sourceId,
      ),
    ).toEqual(["source-b"]);
  });
});
