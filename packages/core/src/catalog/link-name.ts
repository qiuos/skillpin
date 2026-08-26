import { createHash } from "node:crypto";

import { CoreError } from "../domain/errors.js";
import { err, ok, type Result } from "../shared/result.js";

const unsafeLinkName = /[\0<>:"/\\|?*\p{Cc}]/u;

/** Validates the directory-derived project link name as one portable path segment. */
export function validateLinkName(linkName: string): Result<string, CoreError> {
  if (
    linkName === "" ||
    linkName === "." ||
    linkName === ".." ||
    unsafeLinkName.test(linkName)
  ) {
    return err(
      new CoreError(
        "A skill directory name cannot be used as a portable project link name.",
        "SOURCE_INVALID",
        { fieldPath: "linkName" },
        false,
        "edit-source",
      ),
    );
  }

  return ok(linkName);
}

/** Produces the case-folded cross-platform name used to group link conflicts. */
export function getLinkConflictKey(linkName: string): string {
  return linkName.toLocaleLowerCase("en-US");
}

/** Creates a stable source-local candidate identity without exposing raw paths. */
export function createSkillCandidateId(
  sourceId: string,
  relativePath: string,
): string {
  return createHash("sha256")
    .update(`${sourceId}\0${relativePath}`, "utf8")
    .digest("hex");
}

/** Creates a lower-case SHA-256 fingerprint over the exact SKILL.md bytes. */
export function fingerprintSkillContent(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
