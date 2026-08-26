import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProjectManifestRepository,
  UserConfigRepository,
  createDefaultUserConfig,
  getProjectManifestPath,
  parseProjectManifest,
  parseUserConfig,
} from "./index.js";

const fingerprint = "a".repeat(64);
const source = {
  displayName: "Personal Skills",
  enabled: true,
  id: "personal",
  path: "/Users/example/skills",
} as const;
const managedSkill = {
  linkName: "code-review",
  linkType: "symlink",
  skillRelativePath: "engineering/code-review",
  sourceId: "personal",
  targetFingerprint: fingerprint,
} as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "skillpin-p2-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function backupPaths(filePath: string): Promise<string[]> {
  const directory = path.dirname(filePath);
  const prefix = `${path.basename(filePath)}.backup-`;
  return (await readdir(directory))
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(directory, name));
}

describe("user configuration persistence", () => {
  it("returns an in-memory default for a missing file without creating it", async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, "config", "skillpin.json");

    const result = await new UserConfigRepository({ filePath }).load();

    expect(result).toEqual({
      ok: true,
      value: { kind: "missing", value: createDefaultUserConfig() },
    });
    await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses corrupt input and does not overwrite it during save", async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, "skillpin.json");
    const corrupt = "{ this is not json";
    await writeFile(filePath, corrupt, "utf8");
    const repository = new UserConfigRepository({ filePath });

    const loaded = await repository.load();
    const saved = await repository.save(createDefaultUserConfig());

    expect(loaded).toMatchObject({
      ok: false,
      error: { code: "JSON_PARSE_FAILED" },
    });
    expect(saved).toMatchObject({
      ok: false,
      error: { code: "JSON_PARSE_FAILED" },
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(corrupt);
  });

  it("migrates valid v0 input with a backup before atomic replacement", async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, "skillpin.json");
    const legacy = JSON.stringify(
      { schemaVersion: 0, sources: [source] },
      null,
      2,
    );
    await writeFile(filePath, legacy, "utf8");

    const result = await new UserConfigRepository({ filePath }).load();

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "migrated",
        value: { preferences: { theme: "system" }, schemaVersion: 1 },
      },
    });
    const backups = await backupPaths(filePath);
    expect(backups).toHaveLength(1);
    await expect(readFile(backups[0]!, "utf8")).resolves.toBe(legacy);
    await expect(readFile(filePath, "utf8")).resolves.toContain(
      '"schemaVersion": 1',
    );
  });

  it("keeps the legacy source untouched when a migration write fails", async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, "skillpin.json");
    const legacy = JSON.stringify({ schemaVersion: 0, sources: [source] });
    await writeFile(filePath, legacy, "utf8");

    const result = await new UserConfigRepository({
      filePath,
      onBeforeWriteStep(step) {
        if (step === "write-temporary") {
          throw new Error("injected failure");
        }
      },
    }).load();

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SCHEMA_MIGRATION_FAILED" },
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(legacy);
    expect(await backupPaths(filePath)).toHaveLength(1);
  });

  it("rejects future versions without modifying the file", async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, "skillpin.json");
    const future = JSON.stringify({
      preferences: { theme: "system" },
      schemaVersion: 2,
      sources: [],
    });
    await writeFile(filePath, future, "utf8");

    const result = await new UserConfigRepository({ filePath }).load();

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SCHEMA_VERSION_UNSUPPORTED" },
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(future);
  });

  it("rejects invalid source records and duplicate identifiers deterministically", () => {
    expect(
      parseUserConfig({
        preferences: { theme: "system" },
        schemaVersion: 1,
        sources: [source, { ...source, displayName: "Duplicate" }],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_USER_CONFIG",
        details: { fieldPath: "sources[1].id" },
      },
    });
  });
});

describe("project manifest persistence", () => {
  it("uses the fixed project-relative manifest location", () => {
    expect(getProjectManifestPath("/workspace/demo")).toBe(
      path.join("/workspace/demo", ".agents", "skillpin.json"),
    );
  });

  it("advances revisions through its explicit save contract and backs up a valid prior document", async () => {
    const directory = await temporaryDirectory();
    const filePath = getProjectManifestPath(directory);
    const repository = new ProjectManifestRepository({ filePath });

    expect(await repository.load()).toEqual({
      ok: true,
      value: {
        kind: "missing",
        value: { managedSkills: [], revision: 0, schemaVersion: 1 },
      },
    });
    const first = await repository.save({ baseRevision: 0, managedSkills: [] });
    const second = await repository.save({
      baseRevision: 1,
      managedSkills: [managedSkill],
    });
    const stale = await repository.save({ baseRevision: 0, managedSkills: [] });

    expect(first).toMatchObject({
      ok: true,
      value: { backupPath: null, value: { revision: 1 } },
    });
    expect(second).toMatchObject({
      ok: true,
      value: { value: { managedSkills: [managedSkill], revision: 2 } },
    });
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "REVISION_CONFLICT" },
    });
    expect(await backupPaths(filePath)).toHaveLength(1);
    const persisted = await readFile(filePath, "utf8");
    expect(persisted).toContain('"sourceId": "personal"');
    expect(persisted).not.toContain(source.path);
  });

  it("rejects corrupt and future manifest input without replacing it", async () => {
    const directory = await temporaryDirectory();
    const filePath = getProjectManifestPath(directory);
    await mkdir(path.dirname(filePath), { recursive: true });
    const corrupt = "not json";
    await writeFile(filePath, corrupt, "utf8");
    const repository = new ProjectManifestRepository({ filePath });

    expect(
      await repository.save({ baseRevision: 0, managedSkills: [] }),
    ).toMatchObject({
      ok: false,
      error: { code: "JSON_PARSE_FAILED" },
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(corrupt);

    const future = JSON.stringify({
      managedSkills: [],
      revision: 0,
      schemaVersion: 2,
    });
    await writeFile(filePath, future, "utf8");
    expect(await repository.load()).toMatchObject({
      ok: false,
      error: { code: "SCHEMA_VERSION_UNSUPPORTED" },
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(future);
  });

  it("migrates v0 manifests and preserves them if the atomic migration fails", async () => {
    const directory = await temporaryDirectory();
    const filePath = getProjectManifestPath(directory);
    await mkdir(path.dirname(filePath), { recursive: true });
    const legacy = JSON.stringify({
      managedSkills: [managedSkill],
      schemaVersion: 0,
    });
    await writeFile(filePath, legacy, "utf8");

    const migrated = await new ProjectManifestRepository({ filePath }).load();
    expect(migrated).toMatchObject({
      ok: true,
      value: { kind: "migrated", value: { revision: 0, schemaVersion: 1 } },
    });
    expect(await backupPaths(filePath)).toHaveLength(1);

    await writeFile(filePath, legacy, "utf8");
    const failed = await new ProjectManifestRepository({
      filePath,
      onBeforeWriteStep(step) {
        if (step === "replace") {
          throw new Error("injected failure");
        }
      },
    }).load();
    expect(failed).toMatchObject({
      ok: false,
      error: { code: "SCHEMA_MIGRATION_FAILED" },
    });
    await expect(readFile(filePath, "utf8")).resolves.toBe(legacy);
  });

  it("rejects absolute, escaping, and duplicate managed-link paths", () => {
    for (const skillRelativePath of [
      "/absolute",
      "../escape",
      "folder/../../escape",
      "C:\\escape",
    ]) {
      expect(
        parseProjectManifest({
          managedSkills: [{ ...managedSkill, skillRelativePath }],
          revision: 0,
          schemaVersion: 1,
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "INVALID_PROJECT_MANIFEST" },
      });
    }

    expect(
      parseProjectManifest({
        managedSkills: [
          managedSkill,
          { ...managedSkill, linkName: "CODE-REVIEW" },
        ],
        revision: 0,
        schemaVersion: 1,
      }),
    ).toMatchObject({
      ok: false,
      error: { details: { fieldPath: "managedSkills[1].linkName" } },
    });
  });
});
