import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getDirectoryBrowserEntrypoints,
  listDirectories,
  SkillSourceService,
} from "../../packages/core/src/catalog/index.js";
import { UserConfigRepository } from "../../packages/core/src/persistence/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "skillpin-p3-source-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("P3 source management", () => {
  it("adds, rebinds, enables, disables, and removes a canonicalized source", async () => {
    const directory = await temporaryDirectory();
    const sourceOne = path.join(directory, "source-one");
    const sourceTwo = path.join(directory, "source-two");
    const sourceOneAlias = path.join(directory, "source-one-alias");
    await Promise.all([mkdir(sourceOne), mkdir(sourceTwo)]);
    await symlink(sourceOne, sourceOneAlias, "dir");

    const repository = new UserConfigRepository({
      filePath: path.join(directory, "config", "config.json"),
    });
    const service = new SkillSourceService({
      createId: () => "source-1",
      repository,
    });

    const added = await service.add({
      displayName: "  Personal skills  ",
      path: `  ${sourceOne}  `,
    });
    expect(added).toMatchObject({
      ok: true,
      value: { displayName: "Personal skills", enabled: true, id: "source-1" },
    });
    expect(added.ok ? added.value.path : "").not.toBe(sourceOneAlias);

    expect(
      await service.add({ displayName: "Alias", path: sourceOneAlias }),
    ).toMatchObject({ ok: false, error: { code: "SOURCE_DUPLICATE" } });

    const updated = await service.update("source-1", {
      displayName: "Rebound source",
      enabled: false,
      path: sourceTwo,
    });
    expect(updated).toMatchObject({
      ok: true,
      value: {
        displayName: "Rebound source",
        enabled: false,
        path: await realpath(sourceTwo),
      },
    });
    expect(await service.setEnabled("source-1", true)).toMatchObject({
      ok: true,
      value: { enabled: true },
    });

    expect(await service.remove("source-1")).toMatchObject({ ok: true });
    await expect(readFile(sourceTwo, "utf8")).rejects.toMatchObject({
      code: "EISDIR",
    });
    expect(await service.list()).toMatchObject({ ok: true, value: [] });
  });

  it("rejects unreadable paths and lists only directories", async () => {
    const directory = await temporaryDirectory();
    const childDirectory = path.join(directory, "child-directory");
    await mkdir(childDirectory);
    await writeFile(
      path.join(directory, "private.md"),
      "do not read me",
      "utf8",
    );

    const listing = await listDirectories(directory);
    expect(listing).toMatchObject({
      ok: true,
      value: {
        entries: [
          { name: "child-directory", path: await realpath(childDirectory) },
        ],
      },
    });
    expect(
      await listDirectories(path.join(directory, "private.md")),
    ).toMatchObject({
      ok: false,
      error: { code: "DIRECTORY_UNREADABLE" },
    });

    const service = new SkillSourceService({
      repository: new UserConfigRepository({
        filePath: path.join(directory, "config.json"),
      }),
    });
    expect(
      await service.add({
        displayName: "Missing",
        path: path.join(directory, "missing"),
      }),
    ).toMatchObject({ ok: false, error: { code: "SOURCE_UNREADABLE" } });
    expect(
      getDirectoryBrowserEntrypoints({
        homeDirectory: directory,
        recentPaths: [childDirectory],
      }).map((entry) => entry.kind),
    ).toEqual(["home", "root", "recent"]);
  });
});
