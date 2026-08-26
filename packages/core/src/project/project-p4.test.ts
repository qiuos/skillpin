import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { planProjectChanges } from "../changes/change-planner.js";
import {
  applyLinkTransaction,
  ProjectChangeService,
} from "../changes/link-transaction.js";
import { NodePlatformLinkAdapter } from "../platform/node-platform-link-adapter.js";
import { getProjectManifestPath } from "./manifest-repository.js";
import { ProjectLock } from "./project-lock.js";
import { ProjectSnapshotService } from "./project-snapshot-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function fixture(): Promise<{
  readonly adapter: NodePlatformLinkAdapter;
  readonly candidateA: Candidate;
  readonly candidateB: Candidate;
  readonly projectDirectory: string;
  readonly sourceA: string;
  readonly sourceB: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "skillpin-p4-"));
  temporaryDirectories.push(root);
  const projectDirectory = path.join(root, "project");
  const sourceA = path.join(root, "source-a", "review");
  const sourceB = path.join(root, "source-b", "review");
  await Promise.all([
    mkdir(projectDirectory, { recursive: true }),
    mkdir(sourceA, { recursive: true }),
    mkdir(sourceB, { recursive: true }),
  ]);
  return {
    adapter: new NodePlatformLinkAdapter(),
    candidateA: candidate("candidate-a", "source-a", sourceA),
    candidateB: candidate("candidate-b", "source-b", sourceB),
    projectDirectory,
    sourceA,
    sourceB,
  };
}

type Candidate = {
  readonly id: string;
  readonly linkName: string;
  readonly skillRelativePath: string;
  readonly sourceId: string;
  readonly targetPath: string;
};

function candidate(
  id: string,
  sourceId: string,
  targetPath: string,
): Candidate {
  return {
    id,
    linkName: "code-review",
    skillRelativePath: "engineering/code-review",
    sourceId,
    targetPath,
  };
}

function service(
  projectDirectory: string,
  adapter: NodePlatformLinkAdapter,
): ProjectChangeService {
  return new ProjectChangeService({
    adapter,
    snapshotService: new ProjectSnapshotService({
      adapter,
      projectDirectory,
      sources: [
        { enabled: true, id: "source-a" },
        { enabled: true, id: "source-b" },
      ],
    }),
  });
}

describe("P4 project inspection and mutation", () => {
  it("inspects unknown content as read-only and does not allow a plan to overwrite it", async () => {
    const { adapter, candidateA, projectDirectory } = await fixture();
    const occupied = path.join(
      projectDirectory,
      ".agents",
      "skills",
      "code-review",
    );
    await mkdir(occupied, { recursive: true });
    await writeFile(path.join(occupied, "manual.txt"), "manual", "utf8");

    const snapshot = await new ProjectSnapshotService({
      adapter,
      projectDirectory,
    }).inspect();
    expect(snapshot).toMatchObject({
      ok: true,
      value: {
        links: [{ linkName: "code-review", state: "unknown-directory" }],
      },
    });
    if (!snapshot.ok) return;
    expect(
      planProjectChanges(snapshot.value, [
        { candidate: candidateA, linkName: "code-review" },
      ]).blockers,
    ).toMatchObject([{ code: "UNKNOWN_OCCUPIED" }]);
    await expect(
      readFile(path.join(occupied, "manual.txt"), "utf8"),
    ).resolves.toBe("manual");
  });

  it("reports manifest mismatches and transaction residue without deleting either", async () => {
    const { adapter, candidateA, candidateB, projectDirectory } =
      await fixture();
    const changes = service(projectDirectory, adapter);
    await changes.apply({
      baseRevision: 0,
      requestId: "initial-mismatch",
      selections: [{ candidate: candidateA, linkName: "code-review" }],
    });
    const linkPath = path.join(
      projectDirectory,
      ".agents",
      "skills",
      "code-review",
    );
    const original = await adapter.inspectLink(linkPath);
    if (
      !original.ok ||
      original.value.kind !== "link" ||
      original.value.targetPath === null
    ) {
      throw new Error("Expected a live managed link.");
    }
    const removed = await adapter.removeManagedLink(linkPath, {
      linkType: original.value.linkType as "symlink" | "junction",
      targetFingerprint: original.value.targetFingerprint as string,
      targetPath: original.value.targetPath,
    });
    if (!removed.ok) throw removed.error;
    const replacement = await adapter.createDirectoryLink({
      linkPath,
      targetPath: candidateB.targetPath,
    });
    if (!replacement.ok) throw replacement.error;
    const residue = path.join(
      projectDirectory,
      ".agents",
      "skills",
      ".code-review.skillpin-tmp-interrupted",
    );
    await writeFile(residue, "do not delete", "utf8");

    const snapshot = await new ProjectSnapshotService({
      adapter,
      projectDirectory,
    }).inspect();
    expect(snapshot).toMatchObject({
      ok: true,
      value: {
        links: expect.arrayContaining([
          expect.objectContaining({
            linkName: "code-review",
            state: "manifest-mismatch",
          }),
        ]),
        recoveryDiagnostics: [
          {
            kind: "temporary",
            path: residue,
            safeToDelete: false,
          },
        ],
      },
    });
    await expect(readFile(residue, "utf8")).resolves.toBe("do not delete");
  });

  it("adds, replaces, removes, rejects stale revisions, and deduplicates a successful request", async () => {
    const {
      adapter,
      candidateA,
      candidateB,
      projectDirectory,
      sourceA,
      sourceB,
    } = await fixture();
    const changes = service(projectDirectory, adapter);

    const added = await changes.apply({
      baseRevision: 0,
      requestId: "add-review",
      selections: [{ candidate: candidateA, linkName: "code-review" }],
    });
    expect(added).toMatchObject({
      ok: true,
      value: { manifest: { revision: 1 } },
    });
    await expect(
      readFile(
        path.join(
          projectDirectory,
          ".agents",
          "skills",
          "code-review",
          "marker",
        ),
        "utf8",
      ),
    ).rejects.toThrow();
    const liveAdd = await adapter.inspectLink(
      path.join(projectDirectory, ".agents", "skills", "code-review"),
    );
    expect(liveAdd).toMatchObject({
      ok: true,
      value: { kind: "link", targetPath: await realpath(sourceA) },
    });

    const duplicate = await changes.apply({
      baseRevision: 0,
      requestId: "add-review",
      selections: [{ candidate: candidateA, linkName: "code-review" }],
    });
    expect(duplicate).toMatchObject({
      ok: true,
      value: { idempotent: true, manifest: { revision: 1 } },
    });

    const stale = await changes.apply({
      baseRevision: 0,
      requestId: "stale",
      selections: [{ candidate: candidateB, linkName: "code-review" }],
    });
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "REVISION_CONFLICT" },
    });

    const replaced = await changes.apply({
      baseRevision: 1,
      requestId: "replace-review",
      selections: [{ candidate: candidateB, linkName: "code-review" }],
    });
    if (!replaced.ok) throw replaced.error;
    expect(replaced).toMatchObject({
      ok: true,
      value: { manifest: { revision: 2 } },
    });
    const liveReplace = await adapter.inspectLink(
      path.join(projectDirectory, ".agents", "skills", "code-review"),
    );
    expect(liveReplace).toMatchObject({
      ok: true,
      value: { targetPath: await realpath(sourceB) },
    });

    const removed = await changes.apply({
      baseRevision: 2,
      requestId: "remove-review",
      selections: [{ candidate: null, linkName: "code-review" }],
    });
    expect(removed).toMatchObject({
      ok: true,
      value: { manifest: { revision: 3 } },
    });
    const liveRemove = await adapter.inspectLink(
      path.join(projectDirectory, ".agents", "skills", "code-review"),
    );
    expect(liveRemove).toMatchObject({ ok: true, value: { kind: "missing" } });
    await expect(
      readFile(getProjectManifestPath(projectDirectory), "utf8"),
    ).resolves.toContain('"revision": 3');
  });

  it("rolls every injectable replacement phase back to its verified original link", async () => {
    const steps = [
      "stage-links",
      "backup-links",
      "promote-links",
      "write-manifest-temporary",
      "backup-manifest",
      "commit-manifest",
      "discard-backups",
    ] as const;

    for (const stepToFail of steps) {
      const { adapter, candidateA, candidateB, projectDirectory, sourceA } =
        await fixture();
      const changes = service(projectDirectory, adapter);
      await changes.apply({
        baseRevision: 0,
        requestId: `initial-${stepToFail}`,
        selections: [{ candidate: candidateA, linkName: "code-review" }],
      });
      const snapshotService = new ProjectSnapshotService({
        adapter,
        projectDirectory,
      });
      const snapshot = await snapshotService.inspect();
      if (!snapshot.ok) throw snapshot.error;
      const plan = planProjectChanges(snapshot.value, [
        { candidate: candidateB, linkName: "code-review" },
      ]);
      const failed = await applyLinkTransaction({
        adapter,
        baseRevision: 1,
        changes: plan.changes,
        manifestPath: getProjectManifestPath(projectDirectory),
        onBeforeStep: (step) => {
          if (step === stepToFail) throw new Error("injected failure");
        },
        projectDirectory,
        requestId: `rollback-${stepToFail}`,
        snapshot: snapshot.value,
      });
      expect(failed).toMatchObject({
        ok: false,
        error: {
          code: "TRANSACTION_FAILED",
          details: { transactionStep: stepToFail },
        },
      });
      const live = await adapter.inspectLink(
        path.join(projectDirectory, ".agents", "skills", "code-review"),
      );
      expect(live).toMatchObject({
        ok: true,
        value: { targetPath: await realpath(sourceA) },
      });
      const after = await snapshotService.inspect();
      expect(after).toMatchObject({
        ok: true,
        value: { manifestRevision: 1, recoveryDiagnostics: [] },
      });
    }
  });

  it("rejects path-unsafe candidates and request identifiers before mutation", async () => {
    const { adapter, candidateA, projectDirectory } = await fixture();
    const changes = service(projectDirectory, adapter);
    const unsafeCandidate = { ...candidateA, linkName: "../outside" };
    const snapshot = await new ProjectSnapshotService({
      adapter,
      projectDirectory,
    }).inspect();
    if (!snapshot.ok) throw snapshot.error;
    expect(
      planProjectChanges(snapshot.value, [
        { candidate: unsafeCandidate, linkName: "../outside" },
      ]).blockers,
    ).toMatchObject([{ code: "INVALID_CANDIDATE" }]);

    const invalidRequest = await changes.apply({
      baseRevision: 0,
      requestId: "../unsafe-request",
      selections: [{ candidate: candidateA, linkName: "code-review" }],
    });
    expect(invalidRequest).toMatchObject({
      ok: false,
      error: { code: "CHANGESET_INVALID" },
    });
    const live = await adapter.inspectLink(
      path.join(projectDirectory, ".agents", "skills", "code-review"),
    );
    expect(live).toMatchObject({ ok: true, value: { kind: "missing" } });
  });

  it("permits only one in-process lease for a normalized project path", () => {
    const lock = new ProjectLock();
    const first = lock.tryAcquire("/tmp/skillpin-p4-lock/child/..");
    const second = lock.tryAcquire("/tmp/skillpin-p4-lock");
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    first?.release();
    expect(lock.tryAcquire("/tmp/skillpin-p4-lock")).not.toBeNull();
  });
});
