export type CliErrorCode =
  | "CLI_ARGUMENT_INVALID"
  | "CLI_PORT_UNAVAILABLE"
  | "CLI_TARGET_INVALID"
  | "CLI_TARGET_UNSUPPORTED";

/** Expected startup failures rendered as concise, stack-free terminal output. */
export class CliError extends Error {
  public constructor(
    message: string,
    public readonly code: CliErrorCode,
  ) {
    super(message);
    this.name = "CliError";
  }
}
