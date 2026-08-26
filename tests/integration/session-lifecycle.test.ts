import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { attachSignalHandlers } from "../../packages/cli/src/command/signal-handlers.js";
import {
  SessionManager,
  type ManagedSession,
} from "../../packages/cli/src/session/session-manager.js";

import { delay } from "./p5-helpers.js";

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

async function projectDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "skillpin-p5-session-"));
  temporaryDirectories.push(directory);
  return directory;
}

function keep(session: ManagedSession): ManagedSession {
  sessions.push(session);
  return session;
}

describe("P5 session registry and lifecycle", () => {
  it("deduplicates a realpath alias and keeps independent projects separate", async () => {
    const firstProject = await projectDirectory();
    const aliasParent = await projectDirectory();
    const alias = path.join(aliasParent, "project-alias");
    await symlink(firstProject, alias, "dir");
    const secondProject = await projectDirectory();
    const manager = new SessionManager();

    const first = await manager.start({ target: firstProject });
    const reused = await manager.start({ target: alias });
    const second = await manager.start({ target: secondProject });
    keep(first.session);
    keep(second.session);

    expect(first.reused).toBe(false);
    expect(reused.reused).toBe(true);
    expect(reused.session).toBe(first.session);
    expect(first.session.projectFingerprint).toHaveLength(64);
    expect(first.session.projectFingerprint).not.toContain(firstProject);
    expect(second.session).not.toBe(first.session);
    expect(second.session.address).not.toBe(first.session.address);
    expect(manager.registrySize).toBe(2);
  });

  it("starts the final-page grace period, cancels it on reconnect, then removes the session", async () => {
    const project = await projectDirectory();
    const manager = new SessionManager();
    const started = await manager.start({
      exitGraceMs: 25,
      heartbeatIntervalMs: 5,
      heartbeatTimeoutMs: 20,
      target: project,
    });
    const session = keep(started.session);

    session.setClientCount(1);
    session.setClientCount(0);
    expect(session.status).toBe("waiting-to-exit");
    await delay(5);
    session.setClientCount(1);
    expect(session.status).toBe("running");
    await delay(35);
    expect(manager.registrySize).toBe(1);

    session.setClientCount(0);
    await delay(45);
    expect(manager.registrySize).toBe(0);
    sessions.splice(sessions.indexOf(session), 1);
  });

  it("waits for a tracked P4 apply before completing explicit close", async () => {
    const project = await projectDirectory();
    const source = path.join(project, "source-skill");
    await mkdir(source);
    const manager = new SessionManager();
    const started = await manager.start({ target: project });
    const session = keep(started.session);
    let release: (() => void) | undefined;
    const operation = session.runProjectOperation(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return session.projectServices.changeService.apply({
        baseRevision: 0,
        requestId: "close-during-apply",
        selections: [
          {
            candidate: {
              id: "source-skill",
              linkName: "source-skill",
              skillRelativePath: "source-skill",
              sourceId: "source",
              targetPath: source,
            },
            linkName: "source-skill",
          },
        ],
      });
    });
    const closing = session.close("explicit");

    await delay(5);
    expect(session.status).toBe("exiting");
    expect(manager.registrySize).toBe(1);
    release?.();
    await expect(operation).resolves.toMatchObject({ ok: true });
    await closing;
    expect(manager.registrySize).toBe(0);
    sessions.splice(sessions.indexOf(session), 1);
  });

  it("routes simulated SIGTERM through the same graceful close path", async () => {
    const manager = new SessionManager();
    const started = await manager.start({ target: await projectDirectory() });
    const session = keep(started.session);
    const signals = new EventEmitter();
    attachSignalHandlers(session, signals);

    signals.emit("SIGTERM");
    await delay(10);

    expect(manager.registrySize).toBe(0);
    sessions.splice(sessions.indexOf(session), 1);
  });

  it("rejects a non-directory before it can enter the registry", async () => {
    const root = await projectDirectory();
    const file = path.join(root, "not-a-project");
    await mkdir(file);
    await rm(file, { recursive: true });
    const manager = new SessionManager();

    await expect(manager.start({ target: file })).rejects.toMatchObject({
      code: "CLI_TARGET_INVALID",
    });
    expect(manager.registrySize).toBe(0);
  });
});
