import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { CoreError } from "../domain/errors.js";
import { systemErrorCode } from "../platform/path-normalization.js";
import { err, ok, type Result } from "../shared/result.js";

export interface DirectoryBrowserEntry {
  readonly kind: "home" | "recent" | "root";
  readonly label: string;
  readonly path: string;
}

export interface DirectoryEntry {
  readonly name: string;
  readonly path: string;
  readonly realPath: string;
}

export interface DirectoryListing {
  readonly directoryPath: string;
  readonly entries: readonly DirectoryEntry[];
}

export interface DirectoryBrowserEntrypointsOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory?: string;
  readonly platform?: NodeJS.Platform;
  readonly recentPaths?: readonly string[];
}

function directoryError(directoryPath: string, error: unknown): CoreError {
  return new CoreError(
    "The directory is unavailable or unreadable.",
    "DIRECTORY_UNREADABLE",
    systemErrorCode(error) === undefined
      ? { filePath: directoryPath }
      : { filePath: directoryPath, systemCode: systemErrorCode(error)! },
    true,
    "choose-directory",
  );
}

function pathApiFor(platform: NodeJS.Platform): typeof path.posix {
  return platform === "win32" ? path.win32 : path.posix;
}

function getPlatformRoots(
  platform: NodeJS.Platform,
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
): readonly string[] {
  const pathApi = pathApiFor(platform);
  if (platform === "win32") {
    const drive = environment.SystemDrive;
    return [
      drive === undefined ? pathApi.parse(homeDirectory).root : `${drive}\\`,
    ];
  }
  return [pathApi.parse(homeDirectory).root];
}

/** Creates the safe browser entry points without reading ordinary-file content. */
export function getDirectoryBrowserEntrypoints(
  options: DirectoryBrowserEntrypointsOptions = {},
): readonly DirectoryBrowserEntry[] {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const homeDirectory = options.homeDirectory ?? environment.HOME ?? homedir();
  const roots = getPlatformRoots(platform, environment, homeDirectory).map(
    (root) => ({ kind: "root" as const, label: root, path: root }),
  );
  const recent = Array.from(new Set(options.recentPaths ?? []))
    .filter((recentPath) => recentPath.trim() !== "")
    .map((recentPath) => ({
      kind: "recent" as const,
      label: recentPath,
      path: recentPath,
    }));

  return [
    { kind: "home", label: "Home", path: homeDirectory },
    ...roots,
    ...recent,
  ];
}

/** Lists only child directories (including directory symlinks) for a browser picker. */
export async function listDirectories(
  directoryPath: string,
): Promise<Result<DirectoryListing, CoreError>> {
  const absolutePath = path.resolve(directoryPath);
  try {
    const directoryStats = await stat(absolutePath);
    if (!directoryStats.isDirectory()) {
      return err(directoryError(absolutePath, new Error("Not a directory")));
    }

    const realDirectoryPath = await realpath(absolutePath);
    const entries = await readdir(realDirectoryPath, { withFileTypes: true });
    const directories = await Promise.all(
      entries.map(async (entry): Promise<DirectoryEntry | null> => {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          return null;
        }
        const entryPath = path.join(realDirectoryPath, entry.name);
        try {
          if (!(await stat(entryPath)).isDirectory()) {
            return null;
          }
          return {
            name: entry.name,
            path: entryPath,
            realPath: await realpath(entryPath),
          };
        } catch {
          return null;
        }
      }),
    );

    return ok({
      directoryPath: realDirectoryPath,
      entries: directories
        .filter((entry): entry is DirectoryEntry => entry !== null)
        .sort((left, right) => left.name.localeCompare(right.name)),
    });
  } catch (error: unknown) {
    return err(directoryError(absolutePath, error));
  }
}
