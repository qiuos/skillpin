import { randomUUID } from "node:crypto";
import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  rm as nodeRm,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "./result.js";
import { CoreError, type CoreErrorDetails } from "../domain/errors.js";

export type AtomicWriteStep =
  | "create-directory"
  | "read-existing"
  | "write-backup"
  | "write-temporary"
  | "replace";

export interface AtomicJsonFileSystem {
  mkdir(
    directory: string,
    options: { readonly recursive: true },
  ): Promise<void>;
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
  rename(sourcePath: string, destinationPath: string): Promise<void>;
  rm(filePath: string, options: { readonly force: true }): Promise<void>;
  writeFile(
    filePath: string,
    contents: string,
    options: { readonly encoding: "utf8"; readonly flush: true },
  ): Promise<void>;
}

const nodeFileSystem: AtomicJsonFileSystem = {
  async mkdir(directory, options) {
    await nodeMkdir(directory, options);
  },
  readFile: nodeReadFile,
  rename: nodeRename,
  rm: nodeRm,
  async writeFile(filePath, contents, options) {
    await nodeWriteFile(filePath, contents, options);
  },
};

export interface AtomicWriteJsonInput {
  readonly filePath: string;
  readonly fileSystem?: AtomicJsonFileSystem | undefined;
  readonly onBeforeStep?:
    ((step: AtomicWriteStep) => void | Promise<void>) | undefined;
  readonly value: unknown;
}

export interface AtomicWriteJsonSuccess {
  readonly backupPath: string | null;
  readonly filePath: string;
}

export type TextFileRead =
  | { readonly kind: "contents"; readonly text: string }
  | { readonly kind: "missing" };

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? typeof error.code === "string"
      ? error.code
      : undefined
    : undefined;
}

function createErrorDetails(
  base: Omit<CoreErrorDetails, "systemCode">,
  error: unknown,
): CoreErrorDetails {
  const systemCode = errorCode(error);
  return systemCode === undefined ? base : { ...base, systemCode };
}

/** Reads a UTF-8 text file while distinguishing an absent file from read errors. */
export async function readTextFile(
  filePath: string,
  fileSystem: AtomicJsonFileSystem = nodeFileSystem,
): Promise<Result<TextFileRead, CoreError>> {
  try {
    return ok({
      kind: "contents",
      text: await fileSystem.readFile(filePath, "utf8"),
    });
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      return ok({ kind: "missing" });
    }

    return err(
      new CoreError(
        "The JSON file could not be read.",
        "FILE_READ_FAILED",
        createErrorDetails({ filePath }, error),
        true,
        "retry",
      ),
    );
  }
}

/**
 * Writes JSON through a sibling temporary file and preserves an immutable
 * backup of a pre-existing file before replacing it.
 */
export async function writeJsonAtomically(
  input: AtomicWriteJsonInput,
): Promise<Result<AtomicWriteJsonSuccess, CoreError>> {
  const fileSystem = input.fileSystem ?? nodeFileSystem;
  const directory = path.dirname(input.filePath);
  const suffix = randomUUID();
  const temporaryPath = path.join(
    directory,
    `.${path.basename(input.filePath)}.${suffix}.tmp`,
  );
  let backupPath: string | null = null;

  try {
    await input.onBeforeStep?.("create-directory");
    await fileSystem.mkdir(directory, { recursive: true });

    await input.onBeforeStep?.("read-existing");
    const existing = await readTextFile(input.filePath, fileSystem);
    if (!existing.ok) {
      return existing;
    }

    if (existing.value.kind === "contents") {
      backupPath = `${input.filePath}.backup-${suffix}`;
      await input.onBeforeStep?.("write-backup");
      await fileSystem.writeFile(backupPath, existing.value.text, {
        encoding: "utf8",
        flush: true,
      });
    }

    await input.onBeforeStep?.("write-temporary");
    await fileSystem.writeFile(
      temporaryPath,
      `${JSON.stringify(input.value, null, 2)}\n`,
      { encoding: "utf8", flush: true },
    );

    await input.onBeforeStep?.("replace");
    await fileSystem.rename(temporaryPath, input.filePath);

    return ok({ backupPath, filePath: input.filePath });
  } catch (error: unknown) {
    await fileSystem.rm(temporaryPath, { force: true }).catch(() => undefined);

    return err(
      new CoreError(
        "The JSON file could not be written atomically.",
        "ATOMIC_WRITE_FAILED",
        createErrorDetails(
          {
            ...(backupPath === null ? {} : { backupPath }),
            filePath: input.filePath,
            recoveryPaths: [
              ...(backupPath === null ? [] : [backupPath]),
              temporaryPath,
            ],
          },
          error,
        ),
        true,
        backupPath === null ? "retry" : "restore-backup",
      ),
    );
  }
}
