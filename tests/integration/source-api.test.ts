import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
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

describe("P7 source management API", () => {
  it("keeps routes protected, scans independently, and preserves configuration on rescan", async () => {
    const project = await temporaryDirectory("skillpin-p7-project-");
    const configDirectory = await temporaryDirectory("skillpin-p7-config-");
    const sourceRoot = await temporaryDirectory("skillpin-p7-source-");
    const skillDirectory = path.join(sourceRoot, "unicode-技能");
    await mkdir(skillDirectory);
    await writeFile(
      path.join(skillDirectory, "SKILL.md"),
      "---\nname: Unicode skill\ndescription: A scanned skill.\n---\n",
      "utf8",
    );
    const configPath = path.join(configDirectory, "config.json");
    const session = await startSession(project, configPath);

    const rejected = await requestLocal(session.address, "/api/sources", {
      headers: { Origin: session.address },
    });
    expect(rejected.status).toBe(401);

    const credential = await credentialFor(session);
    const created = await requestLocal(session.address, "/api/sources", {
      body: JSON.stringify({
        displayName: "个人技能",
        enabled: true,
        path: sourceRoot,
      }),
      headers: headers(session, credential),
      method: "POST",
    });
    expect(created.status).toBe(201);
    const source = data<{
      health: string;
      scan: { skillCount: number };
      source: { id: string; path: string };
    }>(created.body);
    expect(source.health).toBe("healthy");
    expect(source.scan.skillCount).toBe(1);
    expect(source.source.path).toBe(await realpath(sourceRoot));

    const configBeforeRescan = await readFile(configPath, "utf8");
    const rescan = await requestLocal(
      session.address,
      `/api/sources/${encodeURIComponent(source.source.id)}/scan`,
      { headers: headers(session, credential), method: "POST" },
    );
    expect(rescan.status).toBe(200);
    expect(await readFile(configPath, "utf8")).toBe(configBeforeRescan);

    const directoryListing = await requestLocal(
      session.address,
      `/api/directories?path=${encodeURIComponent(sourceRoot)}`,
      { headers: headers(session, credential) },
    );
    expect(directoryListing.status).toBe(200);
    const entries = data<{
      entries: { name: string; path: string; realPath: string }[];
    }>(directoryListing.body).entries;
    const canonicalSkillDirectory = await realpath(skillDirectory);
    expect(entries).toEqual([
      expect.objectContaining({
        name: "unicode-技能",
        path: canonicalSkillDirectory,
        realPath: canonicalSkillDirectory,
      }),
    ]);
    expect(directoryListing.body).not.toContain("A scanned skill.");

    const missing = await requestLocal(
      session.address,
      "/api/sources/validate",
      {
        body: JSON.stringify({ path: path.join(sourceRoot, "does-not-exist") }),
        headers: headers(session, credential),
        method: "POST",
      },
    );
    expect(missing.status).toBe(422);

    const malformedId = await requestLocal(
      session.address,
      "/api/sources/%E0%A4%A",
      {
        body: JSON.stringify({
          displayName: "个人技能",
          enabled: true,
          path: sourceRoot,
        }),
        headers: headers(session, credential),
        method: "PATCH",
      },
    );
    expect(malformedId.status).toBe(400);
    expect(JSON.parse(malformedId.body)).toMatchObject({
      error: { code: "API_REQUEST_INVALID" },
      version: 1,
    });
  });

  it("reports source removal impact without mutating project links or source files", async () => {
    const project = await temporaryDirectory("skillpin-p7-impact-project-");
    const configDirectory = await temporaryDirectory(
      "skillpin-p7-impact-config-",
    );
    const sourceRoot = await temporaryDirectory("skillpin-p7-impact-source-");
    await writeFile(
      path.join(sourceRoot, "SKILL.md"),
      "# Source skill\n",
      "utf8",
    );
    const session = await startSession(
      project,
      path.join(configDirectory, "config.json"),
    );
    const credential = await credentialFor(session);
    const created = await requestLocal(session.address, "/api/sources", {
      body: JSON.stringify({
        displayName: "Impact source",
        enabled: true,
        path: sourceRoot,
      }),
      headers: headers(session, credential),
      method: "POST",
    });
    const source = data<{ source: { id: string } }>(created.body).source;

    await mkdir(path.join(project, ".agents", "skills"), { recursive: true });
    const linkPath = path.join(project, ".agents", "skills", "kept-link");
    await writeFile(linkPath, "project-owned marker", "utf8");
    const manifestPath = path.join(project, ".agents", "skillpin.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        managedSkills: [
          {
            linkName: "kept-link",
            linkType: "symlink",
            skillRelativePath: "kept-link",
            sourceId: source.id,
            targetFingerprint: "a".repeat(64),
          },
        ],
        revision: 1,
        schemaVersion: 1,
      }),
      "utf8",
    );
    const originalManifest = await readFile(manifestPath, "utf8");

    const impacted = await requestLocal(
      session.address,
      `/api/sources/${encodeURIComponent(source.id)}`,
      {
        body: JSON.stringify({ confirmProjectImpact: false }),
        headers: headers(session, credential),
        method: "DELETE",
      },
    );
    expect(impacted.status).toBe(200);
    expect(
      data<{ kind: string; impact: { managedLinkCount: number } }>(
        impacted.body,
      ),
    ).toEqual({
      kind: "impact",
      impact: { managedLinkCount: 1, sourceId: source.id },
    });

    const removed = await requestLocal(
      session.address,
      `/api/sources/${encodeURIComponent(source.id)}`,
      {
        body: JSON.stringify({ confirmProjectImpact: true }),
        headers: headers(session, credential),
        method: "DELETE",
      },
    );
    expect(removed.status).toBe(200);
    expect(data<{ kind: string }>(removed.body).kind).toBe("removed");
    expect(await readFile(linkPath, "utf8")).toBe("project-owned marker");
    expect(await readFile(manifestPath, "utf8")).toBe(originalManifest);
    expect(await readFile(path.join(sourceRoot, "SKILL.md"), "utf8")).toBe(
      "# Source skill\n",
    );
  });
});

describe("P8 catalog API", () => {
  it("returns searchable metadata separately from explicitly requested Skill.md detail", async () => {
    const project = await temporaryDirectory("skillpin-p8-project-");
    const configDirectory = await temporaryDirectory("skillpin-p8-config-");
    const sourceRoot = await temporaryDirectory("skillpin-p8-source-");
    const skillDirectory = path.join(sourceRoot, "review");
    await mkdir(skillDirectory);
    await writeFile(
      path.join(skillDirectory, "SKILL.md"),
      "---\nname: Review skill\ndescription: Review a local project.\n---\n# Review\n\nNever expose this in list results.\n",
      "utf8",
    );
    const session = await startSession(
      project,
      path.join(configDirectory, "config.json"),
    );
    const credential = await credentialFor(session);
    const created = await requestLocal(session.address, "/api/sources", {
      body: JSON.stringify({
        displayName: "Personal",
        enabled: true,
        path: sourceRoot,
      }),
      headers: headers(session, credential),
      method: "POST",
    });
    expect(created.status).toBe(201);

    const rejected = await requestLocal(session.address, "/api/catalog", {
      headers: { Origin: session.address },
    });
    expect(rejected.status).toBe(401);
    const listing = await requestLocal(
      session.address,
      "/api/catalog?query=local%20project",
      { headers: headers(session, credential) },
    );
    expect(listing.status).toBe(200);
    expect(listing.body).not.toContain("Never expose this in list results.");
    const candidate = data<{
      groups: { candidates: { id: string; source: { path: string } }[] }[];
    }>(listing.body).groups[0]?.candidates[0];
    expect(candidate).toBeDefined();
    expect(candidate?.source.path).toBe(await realpath(sourceRoot));

    const detail = await requestLocal(
      session.address,
      `/api/catalog/candidates/${encodeURIComponent(candidate?.id ?? "")}`,
      { headers: headers(session, credential) },
    );
    expect(detail.status).toBe(200);
    expect(
      data<{ markdownBody: string; skillFilePath: string }>(detail.body),
    ).toMatchObject({
      markdownBody: expect.stringContaining(
        "Never expose this in list results.",
      ),
      skillFilePath: path.join(await realpath(skillDirectory), "SKILL.md"),
    });
  });
});
