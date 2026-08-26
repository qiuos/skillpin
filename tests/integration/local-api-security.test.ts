import { mkdtemp, rm } from "node:fs/promises";
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

async function startSession(): Promise<ManagedSession> {
  const project = await mkdtemp(path.join(tmpdir(), "skillpin-p5-api-"));
  temporaryDirectories.push(project);
  const manager = new SessionManager();
  const started = await manager.start({
    exitGraceMs: 100,
    heartbeatIntervalMs: 5,
    heartbeatTimeoutMs: 40,
    target: project,
  });
  sessions.push(started.session);
  return started.session;
}

async function bootstrap(session: ManagedSession): Promise<string> {
  const page = await requestLocal(session.address, "/");
  expect(page.status).toBe(200);
  expect(page.headers["access-control-allow-origin"]).toBeUndefined();
  const cookie = page.headers["set-cookie"];
  const header = Array.isArray(cookie) ? cookie[0] : cookie;
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
  return parsed.data.credential;
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
