import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  SessionManager,
  type ManagedSession,
} from "../../packages/cli/src/session/session-manager.js";

import { delay, openWebSocket, requestLocal } from "./p5-helpers.js";

const temporaryDirectories: string[] = [];
const sessions: ManagedSession[] = [];

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

async function startSession(
  options: { readonly staticDirectory?: string } = {},
): Promise<ManagedSession> {
  const project = await mkdtemp(path.join(tmpdir(), "skillpin-p5-api-"));
  temporaryDirectories.push(project);
  const manager = new SessionManager();
  const started = await manager.start({
    exitGraceMs: 100,
    heartbeatIntervalMs: 5,
    heartbeatTimeoutMs: 40,
    ...(options.staticDirectory === undefined
      ? {}
      : { staticDirectory: options.staticDirectory }),
    target: project,
  });
  sessions.push(started.session);
  return started.session;
}

async function bundledStaticDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "skillpin-p11-web-"));
  temporaryDirectories.push(directory);
  await mkdir(path.join(directory, "assets"));
  await writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><html><head><title>Bundled SkillPin</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>',
  );
  await writeFile(
    path.join(directory, "assets", "app.js"),
    "window.skillpinBundled = true;\n",
  );
  await writeFile(path.join(directory, "private.txt"), "must not be served");
  return directory;
}

interface BootstrappedSession {
  readonly credential: string;
  readonly sessionCookie: string;
  readonly setCookies: readonly string[];
}

function headerValues(
  headers: import("node:http").IncomingHttpHeaders,
  name: string,
): readonly string[] {
  const value = headers[name];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

async function bootstrapSession(
  session: ManagedSession,
): Promise<BootstrappedSession> {
  const page = await requestLocal(session.address, "/");
  expect(page.status).toBe(200);
  expect(page.headers["access-control-allow-origin"]).toBeUndefined();
  const header = headerValues(page.headers, "set-cookie")[0];
  if (header === undefined) {
    throw new Error("The static page did not set a bootstrap cookie.");
  }
  const result = await requestLocal(session.address, "/api/session/bootstrap", {
    headers: {
      Cookie: header.split(";")[0] ?? "",
      Origin: session.address,
    },
    method: "POST",
  });
  expect(result.status).toBe(200);
  const parsed = JSON.parse(result.body) as {
    data: { credential: string; session: { sessionId: string } };
  };
  expect(parsed.data.session.sessionId).toBe(session.sessionId);
  const setCookies = headerValues(result.headers, "set-cookie");
  const sessionCookie = setCookies.find((cookie) =>
    cookie.startsWith("skillpin_session="),
  );
  if (sessionCookie === undefined) {
    throw new Error("The bootstrap response did not set a session cookie.");
  }
  return {
    credential: parsed.data.credential,
    sessionCookie: sessionCookie.split(";")[0] ?? "",
    setCookies,
  };
}

async function bootstrap(session: ManagedSession): Promise<string> {
  return (await bootstrapSession(session)).credential;
}

describe("P5 loopback HTTP and WebSocket security", () => {
  it("serves static content but requires one-time bootstrap and session credentials for APIs", async () => {
    const session = await startSession();
    const page = await requestLocal(session.address, "/");
    const cookie = Array.isArray(page.headers["set-cookie"])
      ? page.headers["set-cookie"][0]
      : page.headers["set-cookie"];
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("/api/session/bootstrap");
    expect(page.headers["access-control-allow-origin"]).toBeUndefined();
    if (cookie === undefined) {
      throw new Error("Missing bootstrap cookie.");
    }

    const unauthorized = await requestLocal(session.address, "/api/session", {
      headers: { Origin: session.address },
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body).not.toContain("stack");

    const firstBootstrap = await requestLocal(
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
    expect(firstBootstrap.status).toBe(200);
    const credential = (
      JSON.parse(firstBootstrap.body) as {
        data: { credential: string };
      }
    ).data.credential;
    const consumed = await requestLocal(
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
    expect(consumed.status).toBe(401);

    const invalid = await requestLocal(session.address, "/api/session", {
      headers: {
        Authorization: "Bearer invalid",
        Origin: session.address,
      },
    });
    expect(invalid.status).toBe(401);
    const valid = await requestLocal(session.address, "/api/session", {
      headers: {
        Authorization: `Bearer ${credential}`,
        Origin: session.address,
      },
    });
    expect(valid.status).toBe(200);
    expect(valid.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("authenticates path validation with the short-lived session cookie fallback", async () => {
    const session = await startSession();
    const bootstrap = await bootstrapSession(session);

    expect(bootstrap.setCookies).toEqual(
      expect.arrayContaining([
        "skillpin_bootstrap=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0",
        expect.stringMatching(
          /^skillpin_session=[A-Za-z0-9_-]+; HttpOnly; Path=\/; SameSite=Strict; Max-Age=600$/,
        ),
      ]),
    );

    const invalidCookie = await requestLocal(session.address, "/api/session", {
      headers: {
        Cookie: "skillpin_session=invalid",
        Origin: session.address,
      },
    });
    expect(invalidCookie.status).toBe(401);

    const validated = await requestLocal(
      session.address,
      "/api/sources/validate",
      {
        body: JSON.stringify({ path: session.projectDirectory }),
        headers: {
          "Content-Type": "application/json",
          Cookie: bootstrap.sessionCookie,
          Origin: session.address,
        },
        method: "POST",
      },
    );
    expect(validated.status).toBe(200);

    const bearer = await requestLocal(session.address, "/api/session", {
      headers: {
        Authorization: `Bearer ${bootstrap.credential}`,
        Origin: session.address,
      },
    });
    expect(bearer.status).toBe(200);

    const shutdown = await requestLocal(
      session.address,
      "/api/session/shutdown",
      {
        headers: {
          Cookie: bootstrap.sessionCookie,
          Origin: session.address,
        },
        method: "POST",
      },
    );
    expect(shutdown.status).toBe(202);
    expect(headerValues(shutdown.headers, "set-cookie")).toContain(
      "skillpin_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0",
    );
  });

  it("serves package static assets without exposing filesystem paths or issuing asset cookies", async () => {
    const staticDirectory = await bundledStaticDirectory();
    const session = await startSession({ staticDirectory });

    const page = await requestLocal(session.address, "/");
    expect(page.status).toBe(200);
    expect(page.body).toContain("Bundled SkillPin");
    expect(page.body).not.toContain(
      "The SkillPin web interface will load here.",
    );
    expect(page.headers["set-cookie"]).toBeDefined();
    expect(page.headers["x-content-type-options"]).toBe("nosniff");

    const asset = await requestLocal(session.address, "/assets/app.js");
    expect(asset.status).toBe(200);
    expect(asset.body).toContain("skillpinBundled");
    expect(asset.headers["content-type"]).toContain("text/javascript");
    expect(asset.headers["set-cookie"]).toBeUndefined();

    const missing = await requestLocal(session.address, "/assets/missing.js");
    const traversal = await requestLocal(
      session.address,
      "/assets/%2e%2e%2fprivate.txt",
    );
    expect(missing.status).toBe(404);
    expect(traversal.status).toBe(404);
    expect(`${missing.body}${traversal.body}`).not.toContain(staticDirectory);

    const hostRejected = await requestLocal(session.address, "/", {
      headers: { Host: "localhost:9999" },
    });
    const originRejected = await requestLocal(
      session.address,
      "/assets/app.js",
      {
        headers: { Origin: "https://attacker.example" },
      },
    );
    expect(hostRejected.status).toBe(403);
    expect(originRejected.status).toBe(403);
  });

  it("serves SPA document fallback for app routes without bootstrap cookies", async () => {
    const staticDirectory = await bundledStaticDirectory();
    const session = await startSession({ staticDirectory });

    for (const route of ["/skills", "/sources", "/onboarding"] as const) {
      const page = await requestLocal(session.address, route);
      expect(page.status).toBe(200);
      expect(page.headers["content-type"]).toContain("text/html");
      expect(page.body).toContain("Bundled SkillPin");
      expect(page.headers["set-cookie"]).toBeUndefined();
      expect(page.headers["x-content-type-options"]).toBe("nosniff");
    }

    const unknown = await requestLocal(session.address, "/not-a-route");
    expect(unknown.status).toBe(404);
    expect(unknown.headers["set-cookie"]).toBeUndefined();

    const privateFile = await requestLocal(session.address, "/private.txt");
    expect(privateFile.status).toBe(404);
    expect(privateFile.body).not.toContain("must not be served");
    expect(privateFile.headers["set-cookie"]).toBeUndefined();

    const packagedIndex = await requestLocal(session.address, "/index.html");
    expect(packagedIndex.status).toBe(404);
    expect(packagedIndex.headers["set-cookie"]).toBeUndefined();

    const postRejected = await requestLocal(session.address, "/skills", {
      method: "POST",
    });
    expect(postRejected.status).toBe(405);
  });

  it("rejects non-session Host and Origin values before exposing an API route", async () => {
    const session = await startSession();
    const hostRejected = await requestLocal(session.address, "/api/session", {
      headers: { Host: "localhost:9999", Origin: session.address },
    });
    const originRejected = await requestLocal(session.address, "/api/session", {
      headers: { Origin: "https://attacker.example" },
    });

    expect(hostRejected.status).toBe(403);
    expect(originRejected.status).toBe(403);
    expect(hostRejected.headers["access-control-allow-origin"]).toBeUndefined();
    expect(originRejected.body).not.toContain(session.projectDirectory);
  });

  it("authenticates WebSocket protocols, maintains client counts, and orders events", async () => {
    const session = await startSession();
    const credential = await bootstrap(session);
    const rejected = await openWebSocket(
      session.address,
      credential,
      "https://attacker.example",
    );
    expect(rejected.status).toBe(403);

    const first = await openWebSocket(
      session.address,
      credential,
      session.address,
    );
    expect(first.status).toBe(101);
    await first.waitForMessages(1);
    const second = await openWebSocket(
      session.address,
      credential,
      session.address,
    );
    expect(second.status).toBe(101);
    await first.waitForMessages(2);
    await second.waitForMessages(1);

    const firstEvents = first.messages as {
      sequence: number;
      type: string;
    }[];
    expect(firstEvents.map((event) => event.sequence)).toEqual([1, 2]);
    expect(
      firstEvents.every((event) => event.type === "session.client-count"),
    ).toBe(true);
    expect(session.clientCount).toBe(2);

    second.close();
    await delay(10);
    expect(session.clientCount).toBe(1);
    first.close();
    await delay(10);
    expect(session.status).toBe("waiting-to-exit");

    const reconnect = await openWebSocket(
      session.address,
      credential,
      session.address,
    );
    expect(reconnect.status).toBe(101);
    await reconnect.waitForMessages(1);
    expect(session.status).toBe("running");
    reconnect.close();
  });

  it("rejects WebSocket handshakes without the negotiated protocol or version", async () => {
    const session = await startSession();
    const credential = await bootstrap(session);
    const missingProtocol = await openWebSocket(
      session.address,
      credential,
      session.address,
      { includeSessionProtocol: false },
    );
    const invalidVersion = await openWebSocket(
      session.address,
      credential,
      session.address,
      { version: "12" },
    );

    expect(missingProtocol.status).toBe(403);
    expect(invalidVersion.status).toBe(403);
  });

  it("does not accept a missing WebSocket credential", async () => {
    const session = await startSession();
    const rejected = await openWebSocket(
      session.address,
      undefined,
      session.address,
    );

    expect(rejected.status).toBe(403);
  });
});
