import { lstat, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  NodePlatformLinkAdapter,
  type PlatformLinkError,
} from "../../packages/core/src/platform/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "skillpin-link-adapter-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function missingPathError(): NodeJS.ErrnoException {
  return Object.assign(new Error("missing"), { code: "ENOENT" });
}

describe("NodePlatformLinkAdapter", () => {
  it("creates, inspects, renames, and safely removes a directory symbolic link", async () => {
    const root = await createTemporaryDirectory();
    const target = path.join(root, "技能 sources", "primary");
    const originalLink = path.join(root, "agent-skills");
    const renamedLink = path.join(root, "agent-skills-renamed");
    await mkdir(target, { recursive: true });
    const adapter = new NodePlatformLinkAdapter();

    const created = await adapter.createDirectoryLink({
      linkPath: originalLink,
      targetPath: target,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.value.linkType).toBe("symlink");
    expect((await lstat(originalLink)).isSymbolicLink()).toBe(true);

    const inspected = await adapter.inspectLink(originalLink);
    expect(inspected).toEqual({
      ok: true,
      value: expect.objectContaining({
        kind: "link",
        dangling: false,
        linkType: "symlink",
        targetPath: created.value.targetPath,
        targetFingerprint: created.value.targetFingerprint,
      }),
    });

    expect(await adapter.renameLink(originalLink, renamedLink)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await adapter.removeManagedLink(renamedLink, created.value)).toEqual(
      { ok: true, value: undefined },
    );
    expect(await adapter.inspectLink(renamedLink)).toEqual({
      ok: true,
      value: { kind: "missing" },
    });
  });

  it("classifies a dangling link without following it", async () => {
    const root = await createTemporaryDirectory();
    const target = path.join(root, "target");
    const linkPath = path.join(root, "dangling");
    await mkdir(target);
    await symlink(target, linkPath, "dir");
    await rm(target, { recursive: true });
    const adapter = new NodePlatformLinkAdapter();

    const inspected = await adapter.inspectLink(linkPath);

    expect(inspected).toEqual({
      ok: true,
      value: expect.objectContaining({
        kind: "link",
        dangling: true,
        targetPath: null,
        targetFingerprint: null,
      }),
    });
  });

  it("refuses to remove a path after it stops being the expected managed link", async () => {
    const root = await createTemporaryDirectory();
    const target = path.join(root, "target");
    const linkPath = path.join(root, "managed-link");
    await mkdir(target);
    const adapter = new NodePlatformLinkAdapter();
    const created = await adapter.createDirectoryLink({
      linkPath,
      targetPath: target,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await rm(linkPath);
    await mkdir(linkPath);
    const removed = await adapter.removeManagedLink(linkPath, created.value);

    expect(removed.ok).toBe(false);
    if (!removed.ok) {
      expect(removed.error.code).toBe("MANAGED_LINK_MISMATCH");
    }
  });

  it("falls back to a Junction only for eligible Windows symlink permission failures", async () => {
    const root = await createTemporaryDirectory();
    const target = path.join(root, "target");
    await mkdir(target);
    const requestedTypes: string[] = [];
    const adapter = new NodePlatformLinkAdapter({
      platform: "win32",
      fileSystem: {
        lstat: async () => {
          throw missingPathError();
        },
        readlink: async () => {
          throw new Error("not called");
        },
        rename: async () => {
          throw new Error("not called");
        },
        rm: async () => {
          throw new Error("not called");
        },
        symlink: async (_target, _link, type) => {
          requestedTypes.push(type);
          if (type === "dir") {
            throw Object.assign(new Error("permission denied"), {
              code: "EPERM",
            });
          }
        },
      },
    });

    const created = await adapter.createDirectoryLink({
      linkPath: path.join(root, "link"),
      targetPath: target,
    });

    expect(created).toEqual({
      ok: true,
      value: expect.objectContaining({ linkType: "junction" }),
    });
    expect(requestedTypes).toEqual(["dir", "junction"]);
  });

  it("does not mask unrelated Windows link creation failures with a Junction", async () => {
    const root = await createTemporaryDirectory();
    const target = path.join(root, "target");
    await mkdir(target);
    const requestedTypes: string[] = [];
    const adapter = new NodePlatformLinkAdapter({
      platform: "win32",
      fileSystem: {
        lstat: async () => {
          throw missingPathError();
        },
        readlink: async () => {
          throw new Error("not called");
        },
        rename: async () => {
          throw new Error("not called");
        },
        rm: async () => {
          throw new Error("not called");
        },
        symlink: async (_target, _link, type) => {
          requestedTypes.push(type);
          throw Object.assign(new Error("broken device"), { code: "EIO" });
        },
      },
    });

    const created = await adapter.createDirectoryLink({
      linkPath: path.join(root, "link"),
      targetPath: target,
    });

    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect((created.error as PlatformLinkError).code).toBe(
        "LINK_CREATION_FAILED",
      );
    }
    expect(requestedTypes).toEqual(["dir"]);
  });
});
