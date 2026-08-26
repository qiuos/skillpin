import { CliError } from "./cli-error.js";

export interface ParsedCliCommand {
  readonly kind: "help" | "start" | "version";
  readonly noOpen: boolean;
  readonly port: number | undefined;
  readonly target: string;
}

export interface ParseCliArgumentsOptions {
  readonly cwd: string;
}

export const CLI_HELP = `Usage: skillpin [target] [options]

Start a protected local SkillPin session for a project directory.

Options:
  --target <directory>  Project directory (defaults to the current directory)
  --port <port>         Loopback port from 1 to 65535
  --no-open             Do not open the browser automatically
  --help, -h            Show this help
  --version, -v         Show the SkillPin version`;

function invalid(message: string): never {
  throw new CliError(message, "CLI_ARGUMENT_INVALID");
}

function parsePort(value: string): number {
  if (!/^[1-9][0-9]{0,4}$/.test(value)) {
    invalid("The --port value must be an integer from 1 to 65535.");
  }
  const port = Number(value);
  if (port > 65535) {
    invalid("The --port value must be an integer from 1 to 65535.");
  }
  return port;
}

/** Parses the small public CLI surface without exiting or writing output. */
export function parseCliArguments(
  args: readonly string[],
  options: ParseCliArgumentsOptions,
): ParsedCliCommand {
  let noOpen = false;
  let port: number | undefined;
  let target: string | undefined;
  let positionalTarget: string | undefined;
  let kind: "help" | "start" | "version" = "start";

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === "--") {
      const remaining = args.slice(index + 1);
      if (remaining.length !== 1 || positionalTarget !== undefined) {
        invalid("Only one target directory may be provided.");
      }
      positionalTarget = remaining[0];
      break;
    }
    if (argument === "--help" || argument === "-h") {
      kind = "help";
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      kind = "version";
      continue;
    }
    if (argument === "--no-open") {
      noOpen = true;
      continue;
    }
    if (argument === "--target" || argument === "--port") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        invalid(`The ${argument} option requires a value.`);
      }
      index += 1;
      if (argument === "--target") {
        if (target !== undefined) {
          invalid("The --target option may only be provided once.");
        }
        target = value;
      } else {
        if (port !== undefined) {
          invalid("The --port option may only be provided once.");
        }
        port = parsePort(value);
      }
      continue;
    }
    if (argument.startsWith("--target=")) {
      if (target !== undefined) {
        invalid("The --target option may only be provided once.");
      }
      const value = argument.slice("--target=".length);
      if (value.length === 0) {
        invalid("The --target option requires a value.");
      }
      target = value;
      continue;
    }
    if (argument.startsWith("--port=")) {
      if (port !== undefined) {
        invalid("The --port option may only be provided once.");
      }
      port = parsePort(argument.slice("--port=".length));
      continue;
    }
    if (argument.startsWith("-")) {
      invalid(`Unknown option: ${argument}`);
    }
    if (positionalTarget !== undefined) {
      invalid("Only one target directory may be provided.");
    }
    positionalTarget = argument;
  }

  if (kind !== "start") {
    if (args.length > 1 || (args.length === 1 && !args[0]?.startsWith("-"))) {
      invalid(
        "The help and version options cannot be combined with other arguments.",
      );
    }
    return { kind, noOpen: false, port: undefined, target: options.cwd };
  }
  if (target !== undefined && positionalTarget !== undefined) {
    invalid("Use either a positional target or --target, not both.");
  }

  return {
    kind,
    noOpen,
    port,
    target: target ?? positionalTarget ?? options.cwd,
  };
}
