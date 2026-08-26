import { readFile } from "node:fs/promises";
import path from "node:path";

import { openBrowser, type BrowserOpen } from "../browser/open-browser.js";
import {
  SessionManager,
  type ManagedSession,
} from "../session/session-manager.js";
import { CLI_HELP, parseCliArguments } from "./parse-args.js";
import { CliError } from "./cli-error.js";

export interface CliOutput {
  error(message: string): void;
  log(message: string): void;
}

export interface RunCliOptions {
  readonly args: readonly string[];
  readonly browserOpen?: BrowserOpen;
  readonly cwd: string;
  readonly output?: CliOutput;
  readonly sessionManager?: SessionManager;
  readonly staticDirectory?: string;
  readonly version?: string;
}

export interface RunCliResult {
  readonly exitCode: number;
  readonly session?: ManagedSession;
}

function defaultOutput(): CliOutput {
  return {
    error: (message) => console.error(message),
    log: (message) => console.log(message),
  };
}

declare const __SKILLPIN_VERSION__: string | undefined;

export async function readCliVersion(): Promise<string> {
  if (typeof __SKILLPIN_VERSION__ === "string") {
    return __SKILLPIN_VERSION__;
  }
  const packageJson = await readFile(
    new URL("../../package.json", import.meta.url),
    "utf8",
  );
  const parsed: unknown = JSON.parse(packageJson);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof parsed.version === "string"
  ) {
    return parsed.version;
  }
  throw new Error("The CLI package version is missing.");
}

/** Runs the CLI without forcing process termination so tests and embedders retain control. */
export async function runCli(options: RunCliOptions): Promise<RunCliResult> {
  const output = options.output ?? defaultOutput();
  let parsed;
  try {
    parsed = parseCliArguments(options.args, { cwd: options.cwd });
  } catch (error: unknown) {
    if (error instanceof CliError) {
      output.error(`SkillPin: ${error.message} (${error.code})`);
      return { exitCode: 2 };
    }
    throw error;
  }
  const version = options.version ?? (await readCliVersion());
  if (parsed.kind === "help") {
    output.log(CLI_HELP);
    return { exitCode: 0 };
  }
  if (parsed.kind === "version") {
    output.log(version);
    return { exitCode: 0 };
  }
  try {
    const manager = options.sessionManager ?? new SessionManager();
    const started = await manager.start({
      ...(parsed.port === undefined ? {} : { port: parsed.port }),
      ...(options.staticDirectory === undefined
        ? {}
        : { staticDirectory: options.staticDirectory }),
      target: path.resolve(options.cwd, parsed.target),
    });
    output.log(`SkillPin local session: ${started.session.address}`);
    if (started.reused) {
      output.log("Reused the existing local session for this project.");
    }
    if (!parsed.noOpen) {
      await (options.browserOpen ?? openBrowser)(started.session.address);
    }
    return { exitCode: 0, session: started.session };
  } catch (error: unknown) {
    if (error instanceof CliError) {
      output.error(`SkillPin: ${error.message} (${error.code})`);
      return { exitCode: 1 };
    }
    output.error(
      "SkillPin: The local session could not be started. (CLI_TARGET_UNSUPPORTED)",
    );
    return { exitCode: 1 };
  }
}
