import { createHash } from "node:crypto";

import { normalizePathForFingerprint } from "./path-normalization.js";

/** Creates the persisted SHA-256 identity for a canonical directory target. */
export function fingerprintTargetPath(
  targetPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return createHash("sha256")
    .update(normalizePathForFingerprint(targetPath, platform), "utf8")
    .digest("hex");
}
