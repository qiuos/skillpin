import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  executeLinkTransaction,
  type LinkTransactionRequest,
  type TransactionStep,
} from "../../packages/core/src/changes/index.js";
import { NodePlatformLinkAdapter } from "../../packages/core/src/platform/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "skillpin-transaction-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function expectNoTransactionArtifacts(root: string): Promise<void> {
  const names = await readdir(root);
  expect(names.filter((name) => name.includes(".skillpin-"))).toEqual([]);
}

function injectFailure(stepToFail: TransactionStep) {
  return (step: TransactionStep) => {
    if (step === stepToFail) {
      throw new Error(`Injected ${step} failure`);
    }
  };
}

describe("file transaction prototype", () => {
  it("commits an add operation with an atomically replaced manifest", async () => {
    const root = await createTemporaryDirectory();
    const target = path.join(root, "target");
    const linkPath = path.join(root, "skills");
    const manifestPath = path.join(root, "manifest.json");
    await mkdir(target);
    await writeFile(manifestPath, '{"revision":0}\n');
    const adapter = new NodePlatformLinkAdapter();

    const result = await executeLinkTransaction({
      kind: "add",
      adapter,
      linkPath,
      targetPath: target,
      manifest: { path: manifestPath, contents: '{"revision":1}\n' },
    });

    expect(result.ok).toBe(true);
    expect(await readFile(manifestPath, "utf8")).toBe('{"revision":1}\n');
    expect((await adapter.inspectLink(linkPath)).value).toEqual(
      expect.objectContaining({
        kind: "link",
        dangling: false,
        targetPath:
          result.ok && result.value.managedLink !== null
            ? result.value.managedLink.targetPath
            : target,
      }),
    );
    await expectNoTransactionArtifacts(root);
  });

  it.each(["remove", "replace"] as const)(
    "commits a %s operation",
    async (kind) => {
      const root = await createTemporaryDirectory();
      const originalTarget = path.join(root, "original-target");
      const replacementTarget = path.join(root, "replacement-target");
      const linkPath = path.join(root, "skills");
      const manifestPath = path.join(root, "manifest.json");
      await Promise.all([
        mkdir(originalTarget),
        mkdir(replacementTarget),
        writeFile(manifestPath, '{"revision":0}\n'),
      ]);
      const adapter = new NodePlatformLinkAdapter();
      const originalLink = await adapter.createDirectoryLink({
        linkPath,
        targetPath: originalTarget,
      });
      expect(originalLink.ok).toBe(true);
      if (!originalLink.ok) {
        return;
      }

      const result = await executeLinkTransaction(
        kind === "remove"
          ? {
              kind,
              adapter,
              linkPath,
              expectedLink: originalLink.value,
              manifest: { path: manifestPath, contents: '{"revision":1}\n' },
            }
          : {
              kind,
              adapter,
              linkPath,
              expectedLink: originalLink.value,
              targetPath: replacementTarget,
              manifest: { path: manifestPath, contents: '{"revision":1}\n' },
            },
      );

      expect(result.ok).toBe(true);
      expect(await readFile(manifestPath, "utf8")).toBe('{"revision":1}\n');
      const inspection = await adapter.inspectLink(linkPath);
      expect(inspection.value).toEqual(
        kind === "remove"
          ? { kind: "missing" }
          : expect.objectContaining({
              kind: "link",
              dangling: false,
              targetPath: result.ok && result.value.managedLink?.targetPath,
            }),
      );
      await expectNoTransactionArtifacts(root);
    },
  );

  it.each([
    ["add", "create-temporary-link"],
    ["add", "promote-temporary-link"],
    ["add", "create-manifest-temporary-file"],
    ["add", "backup-existing-manifest"],
    ["add", "commit-manifest"],
    ["remove", "backup-existing-link"],
    ["remove", "create-manifest-temporary-file"],
    ["remove", "backup-existing-manifest"],
    ["remove", "commit-manifest"],
    ["replace", "backup-existing-link"],
    ["replace", "create-temporary-link"],
    ["replace", "promote-temporary-link"],
    ["replace", "create-manifest-temporary-file"],
    ["replace", "backup-existing-manifest"],
    ["replace", "commit-manifest"],
  ] as const)(
    "restores the original state when %s fails at %s",
    async (kind, failedStep) => {
      const root = await createTemporaryDirectory();
      const originalTarget = path.join(root, "original-target");
      const replacementTarget = path.join(root, "replacement-target");
      const linkPath = path.join(root, "skills");
      const manifestPath = path.join(root, "manifest.json");
      const originalManifest = '{"revision":0}\n';
      await Promise.all([
        mkdir(originalTarget),
        mkdir(replacementTarget),
        writeFile(manifestPath, originalManifest),
      ]);
      const adapter = new NodePlatformLinkAdapter();
      const originalLink = await adapter.createDirectoryLink({
        linkPath,
        targetPath: originalTarget,
      });
      expect(originalLink.ok).toBe(true);
      if (!originalLink.ok) {
        return;
      }

      const base = {
        adapter,
        linkPath,
        manifest: { path: manifestPath, contents: '{"revision":1}\n' },
        onBeforeStep: injectFailure(failedStep),
      };
      const request: LinkTransactionRequest =
        kind === "add"
          ? {
              ...base,
              kind,
              linkPath: path.join(root, "new-skills"),
              targetPath: replacementTarget,
            }
          : kind === "remove"
            ? { ...base, kind, expectedLink: originalLink.value }
            : {
                ...base,
                kind,
                expectedLink: originalLink.value,
                targetPath: replacementTarget,
              };

      const result = await executeLinkTransaction(request);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TRANSACTION_FAILED");
        expect(result.error.failedStep).toBe(failedStep);
        expect(result.error.recovery.status).toBe("restored");
      }
      expect(await readFile(manifestPath, "utf8")).toBe(originalManifest);
      expect((await adapter.inspectLink(linkPath)).value).toEqual(
        expect.objectContaining({
          kind: "link",
          targetPath: originalLink.value.targetPath,
          dangling: false,
        }),
      );
      if (kind === "add") {
        expect(
          (await adapter.inspectLink(path.join(root, "new-skills"))).value,
        ).toEqual({ kind: "missing" });
      }
      await expectNoTransactionArtifacts(root);
    },
  );
});
