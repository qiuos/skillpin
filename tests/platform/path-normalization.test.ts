import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  fingerprintTargetPath,
  normalizeDirectoryTarget,
  normalizePathForFingerprint,
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
    path.join(tmpdir(), "skillpin-normalization-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

describe("path normalization and target fingerprints", () => {
  it("resolves directory targets with spaces and Chinese path segments", async () => {
    const root = await createTemporaryDirectory();
    const target = path.join(root, "技能 sources", "with spaces");
    await mkdir(target, { recursive: true });

    const normalized = await normalizeDirectoryTarget(target);

    expect(normalized).toEqual({ ok: true, value: await realpath(target) });
    if (normalized.ok) {
      expect(fingerprintTargetPath(normalized.value)).toHaveLength(64);
    }
  });

  it("rejects a file as a directory link target", async () => {
    const root = await createTemporaryDirectory();
    const target = path.join(root, "not-a-directory.txt");
    await writeFile(target, "content");

    const normalized = await normalizeDirectoryTarget(target);

    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.error.code).toBe("TARGET_NOT_DIRECTORY");
    }
  });

  it("normalizes Windows case and separators for a stable fingerprint", () => {
    const first = "C:/Skills/中文 Source";
    const second = "c:\\skills\\中文 source\\";

    expect(normalizePathForFingerprint(first, "win32")).toBe(
      normalizePathForFingerprint(second, "win32"),
    );
    expect(fingerprintTargetPath(first, "win32")).toBe(
      fingerprintTargetPath(second, "win32"),
    );
    expect(fingerprintTargetPath("/Skills/Source", "linux")).not.toBe(
      fingerprintTargetPath("/skills/source", "linux"),
    );
  });
});
