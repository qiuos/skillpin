import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SessionManager,
  type ManagedSession,
} from "../../packages/cli/src/session/session-manager.js";
import { requestLocal } from "./p5-helpers.js";

const temporaryDirectories: string[] = [];
const sessions: ManagedSession[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function startSession(
  project: string,
  configPath: string,
): Promise<ManagedSession> {
  const started = await new SessionManager().start({
    exitGraceMs: 20,
    heartbeatIntervalMs: 5,
    heartbeatTimeoutMs: 40,
    target: project,
    userConfigPath: configPath,
  });
  sessions.push(started.session);
  return started.session;
}

async function credentialFor(session: ManagedSession): Promise<string> {
  const page = await requestLocal(session.address, "/");
  const cookie = Array.isArray(page.headers["set-cookie"])
    ? page.headers["set-cookie"][0]
    : page.headers["set-cookie"];
  if (cookie === undefined) {
    throw new Error("The static page did not set a bootstrap cookie.");
  }
  const bootstrap = await requestLocal(
    session.address,
    "/api/session/bootstrap",
    {
      headers: {
        Cookie: cookie.split(";")[0] ?? "",
        Origin: session.address,
      },
      method: "POST",
    },
  );
  return (JSON.parse(bootstrap.body) as { data: { credential: string } }).data
    .credential;
}

function headers(
  session: ManagedSession,
  credential: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${credential}`,
    "Content-Type": "application/json",
    Origin: session.address,
  };
}

function data<T>(body: string): T {
  return (JSON.parse(body) as { data: T }).data;
}

function errorCode(body: string): string {
  return (JSON.parse(body) as { error: { code: string } }).error.code;
}

afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close("explicit")),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("P9 project change API", () => {
  it("protects routes, resolves current catalog candidates server-side, and applies transactionally", async () => {
    const project = await temporaryDirectory("skillpin-p9-project-");
    const configDirectory = await temporaryDirectory("skillpin-p9-config-");
    const sourceRoot = await temporaryDirectory("skillpin-p9-source-");
    const skillDirectory = path.join(sourceRoot, "review");
    await mkdir(skillDirectory);
    await writeFile(
      path.join(skillDirectory, "SKILL.md"),
      "---\nname: Review\ndescription: Review a project.\n---\n",
      "utf8",
    );
    const session = await startSession(
      project,
      path.join(configDirectory, "config.json"),
    );

    const unauthenticated = await requestLocal(
      session.address,
      "/api/project/plan",
      {
        body: JSON.stringify({ selections: [] }),
        headers: {
          "Content-Type": "application/json",
          Origin: session.address,
        },
        method: "POST",
      },
    );
    expect(unauthenticated.status).toBe(401);

    const credential = await credentialFor(session);
    const sourceCreated = await requestLocal(session.address, "/api/sources", {
      body: JSON.stringify({
        displayName: "Personal",
        enabled: true,
        path: sourceRoot,
      }),
      headers: headers(session, credential),
      method: "POST",
    });
    expect(sourceCreated.status).toBe(201);

    const catalog = await requestLocal(session.address, "/api/catalog", {
      headers: headers(session, credential),
    });
    expect(catalog.status).toBe(200);
    const candidateId = data<{
      groups: readonly { candidates: readonly { id: string }[] }[];
    }>(catalog.body).groups[0]?.candidates[0]?.id;
    expect(candidateId).toBeTypeOf("string");
    if (candidateId === undefined)
      throw new Error("Expected a scanned candidate.");

    const initialSnapshot = await requestLocal(
      session.address,
      "/api/project",
      {
        headers: headers(session, credential),
      },
    );
    expect(initialSnapshot.status).toBe(200);
    expect(data<{ manifestRevision: number }>(initialSnapshot.body)).toEqual(
      expect.objectContaining({ manifestRevision: 0 }),
    );

    const selections = [
      {
        candidateId,
        linkName: "review",
        targetPath: "/browser-supplied-path-is-ignored",
      },
    ];
    const planned = await requestLocal(session.address, "/api/project/plan", {
      body: JSON.stringify({ selections }),
      headers: headers(session, credential),
      method: "POST",
    });
    expect(planned.status).toBe(200);
    expect(planned.body).not.toContain(skillDirectory);
    expect(data<{ changes: unknown[] }>(planned.body)).toEqual(
      expect.objectContaining({
        changes: [
          expect.objectContaining({
            candidateId,
            kind: "add",
            linkName: "review",
          }),
        ],
      }),
    );

    const applyInput = {
      baseRevision: 0,
      requestId: "p9-add-review",
      selections,
    };
    const applied = await requestLocal(session.address, "/api/project/apply", {
      body: JSON.stringify(applyInput),
      headers: headers(session, credential),
      method: "POST",
    });
    expect(applied.status).toBe(200);
    expect(
      data<{ idempotent: boolean; snapshot: { manifestRevision: number } }>(
        applied.body,
      ),
    ).toEqual(
      expect.objectContaining({
        idempotent: false,
        snapshot: expect.objectContaining({ manifestRevision: 1 }),
      }),
    );
    expect(
      await realpath(path.join(project, ".agents", "skills", "review")),
    ).toBe(await realpath(skillDirectory));

    const repeated = await requestLocal(session.address, "/api/project/apply", {
      body: JSON.stringify(applyInput),
      headers: headers(session, credential),
      method: "POST",
    });
    expect(repeated.status).toBe(200);
    expect(data<{ idempotent: boolean }>(repeated.body)).toEqual(
      expect.objectContaining({ idempotent: true }),
    );

    const stale = await requestLocal(session.address, "/api/project/apply", {
      body: JSON.stringify({ ...applyInput, requestId: "p9-stale-review" }),
      headers: headers(session, credential),
      method: "POST",
    });
    expect(stale.status).toBe(422);
    expect(errorCode(stale.body)).toBe("REVISION_CONFLICT");

    const missingCandidate = await requestLocal(
      session.address,
      "/api/project/plan",
      {
        body: JSON.stringify({
          selections: [
            { candidateId: "not-in-this-session", linkName: "review" },
          ],
        }),
        headers: headers(session, credential),
        method: "POST",
      },
    );
    expect(missingCandidate.status).toBe(422);
    expect(errorCode(missingCandidate.body)).toBe(
      "CATALOG_CANDIDATE_NOT_FOUND",
    );
  });
});
