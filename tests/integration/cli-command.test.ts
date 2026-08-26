import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseCliArguments } from "../../packages/cli/src/command/parse-args.js";
import { runCli } from "../../packages/cli/src/command/run.js";
import {
  SessionManager,
  type ManagedSession,
} from "../../packages/cli/src/session/session-manager.js";

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

async function project(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "skillpin-p5-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("P5 CLI command", () => {
  it("parses target, port, no-open, help, version, and stable invalid forms", () => {
    expect(parseCliArguments([], { cwd: "/work" })).toMatchObject({
      kind: "start",
      target: "/work",
    });
    expect(
      parseCliArguments(["workspace", "--port=3210", "--no-open"], {
        cwd: "/work",
      }),
    ).toEqual({
      kind: "start",
      noOpen: true,
      port: 3210,
      target: "workspace",
    });
    expect(
      parseCliArguments(["--target", "workspace"], { cwd: "/work" }),
    ).toMatchObject({ target: "workspace" });
    expect(() =>
      parseCliArguments(["one", "--target", "two"], { cwd: "/work" }),
    ).toThrowError(expect.objectContaining({ code: "CLI_ARGUMENT_INVALID" }));
    expect(() =>
      parseCliArguments(["--port", "0"], { cwd: "/work" }),
    ).toThrowError(expect.objectContaining({ code: "CLI_ARGUMENT_INVALID" }));
    expect(parseCliArguments(["--help"], { cwd: "/work" }).kind).toBe("help");
    expect(parseCliArguments(["--version"], { cwd: "/work" }).kind).toBe(
      "version",
    );
  });

  it("prints help/version without creating a session and honors --no-open", async () => {
    const output: string[] = [];
    const messages: string[] = [];
    const outputPort = {
      error: (message: string) => messages.push(message),
      log: (message: string) => output.push(message),
    };
    const help = await runCli({
      args: ["--help"],
      cwd: "/work",
      output: outputPort,
      version: "0.1.0",
    });
    const version = await runCli({
      args: ["--version"],
      cwd: "/work",
      output: outputPort,
      version: "0.1.0",
    });
    expect(help.exitCode).toBe(0);
    expect(version.exitCode).toBe(0);
    expect(output.join("\n")).toContain("Usage: skillpin");
    expect(output).toContain("0.1.0");
    expect(messages).toEqual([]);

    const manager = new SessionManager();
    let browserOpens = 0;
    const started = await runCli({
      args: ["--no-open"],
      browserOpen: async () => {
        browserOpens += 1;
        return true;
      },
      cwd: await project(),
      output: outputPort,
      sessionManager: manager,
      version: "0.1.0",
    });
    if (started.session === undefined) {
      throw new Error("Expected a local session.");
    }
    sessions.push(started.session);
    expect(started.exitCode).toBe(0);
    expect(browserOpens).toBe(0);
    expect(output.join("\n")).toContain("http://127.0.0.1:");
    expect(output.join("\n")).not.toContain("credential");
  });

  it("returns a stable error when an explicit loopback port is occupied", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) =>
      blocker.listen(0, "127.0.0.1", resolve),
    );
    const address = blocker.address();
    if (address === null || typeof address === "string") {
      throw new Error("Unable to reserve a test port.");
    }
    const output: string[] = [];
    const errors: string[] = [];
    const result = await runCli({
      args: ["--port", String(address.port), "--no-open"],
      cwd: await project(),
      output: {
        error: (message) => errors.push(message),
        log: (message) => output.push(message),
      },
      version: "0.1.0",
    });
    await new Promise<void>((resolve) => blocker.close(() => resolve()));

    expect(result.exitCode).toBe(1);
    expect(output).toEqual([]);
    expect(errors.join("\n")).toContain("CLI_PORT_UNAVAILABLE");
  });
});
