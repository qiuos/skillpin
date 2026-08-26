import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "../index.js";
import { PlatformLinkError } from "./platform-link-adapter.js";

function withoutTrailingSeparator(
  value: string,
  pathApi: typeof path.posix,
): string {
  const parsed = pathApi.parse(value);
  return value === parsed.root ? value : value.replace(/[\\/]+$/, "");
}

/**
 * Resolves a directory through the host filesystem so link records always use
 * an absolute, canonical target path.
 */
export async function normalizeDirectoryTarget(
  targetPath: string,
): Promise<Result<string, PlatformLinkError>> {
  const absolutePath = path.resolve(targetPath);

  try {
    const targetStats = await stat(absolutePath);
    if (!targetStats.isDirectory()) {
      return err(
        new PlatformLinkError(
          "Link targets must be directories.",
          "TARGET_NOT_DIRECTORY",
          {
            targetPath: absolutePath,
          },
        ),
      );
    }

    const resolvedPath = await realpath(absolutePath);
    return ok(withoutTrailingSeparator(resolvedPath, path));
  } catch (error: unknown) {
    return err(
      new PlatformLinkError(
        "The link target could not be resolved.",
        "TARGET_NOT_FOUND",
        {
          targetPath: absolutePath,
          systemCode: systemErrorCode(error),
        },
      ),
    );
  }
}

/** Converts a canonical path into a stable fingerprint input for one platform. */
export function normalizePathForFingerprint(
  targetPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const normalized = withoutTrailingSeparator(
    pathApi.normalize(targetPath),
    pathApi,
  );

  return platform === "win32"
    ? normalized.replaceAll("/", "\\").toLowerCase()
    : normalized;
}

export function systemErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}
