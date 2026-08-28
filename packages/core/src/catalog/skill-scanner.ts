import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { CoreError } from "../domain/errors.js";
import type { SkillSource } from "../domain/skill-source.js";
import { systemErrorCode } from "../platform/path-normalization.js";
import { err, ok, type Result } from "../shared/result.js";

import { createSkillCandidateId, validateLinkName } from "./link-name.js";
import type {
  ScannedSkillCandidate,
  SourceScan,
  SourceScanWarning,
} from "./catalog-snapshot.js";
import { parseSkillDocument } from "./skill-parser.js";

function sourceUnreadable(
  source: SkillSource,
  sourcePath: string,
  error: unknown,
): CoreError {
  return new CoreError(
    "The skill source directory is unavailable or unreadable.",
    "SOURCE_UNREADABLE",
    systemErrorCode(error) === undefined
      ? { sourceId: source.id, sourcePath }
      : {
          sourceId: source.id,
          sourcePath,
          systemCode: systemErrorCode(error)!,
        },
    true,
    "edit-source",
  );
}

function unreadableDirectoryWarning(
  path: string,
  message: string,
  error: unknown,
): SourceScanWarning {
  const systemCode = systemErrorCode(error);
  const reason =
    systemCode === "EACCES" || systemCode === "EPERM"
      ? "PERMISSION_DENIED"
      : systemCode === "ENOENT"
        ? "PATH_NOT_FOUND"
        : systemCode === "ELOOP"
          ? "SYMLINK_LOOP"
          : "UNKNOWN";
  return {
    code: "UNREADABLE_DIRECTORY",
    message,
    path,
    reason,
  };
}

function isWithinSource(relativePath: string): boolean {
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

/** Recursively discovers skills in one source with real-path cycle prevention. */
export class SkillScanner {
  public async scan(
    source: SkillSource,
  ): Promise<Result<SourceScan, CoreError>> {
    const sourcePath = path.resolve(source.path);
    let sourceRealPath: string;
    try {
      if (!(await stat(sourcePath)).isDirectory()) {
        return err(
          sourceUnreadable(source, sourcePath, new Error("Not a directory")),
        );
      }
      sourceRealPath = await realpath(sourcePath);
      await readdir(sourceRealPath);
    } catch (error: unknown) {
      return err(sourceUnreadable(source, sourcePath, error));
    }

    const candidates: ScannedSkillCandidate[] = [];
    const warnings: SourceScanWarning[] = [];
    const visited = new Set<string>();

    const visit = async (logicalDirectory: string): Promise<void> => {
      let realDirectory: string;
      try {
        realDirectory = await realpath(logicalDirectory);
      } catch (error: unknown) {
        warnings.push(
          unreadableDirectoryWarning(
            logicalDirectory,
            "A directory could not be resolved while scanning this source.",
            error,
          ),
        );
        return;
      }
      if (visited.has(realDirectory)) {
        return;
      }
      visited.add(realDirectory);

      const skillFilePath = path.join(logicalDirectory, "SKILL.md");
      try {
        if ((await lstat(skillFilePath)).isFile()) {
          const relativePath = (
            path.relative(sourcePath, logicalDirectory) || "."
          )
            .split(path.sep)
            .join("/");
          if (!isWithinSource(relativePath)) {
            warnings.push(
              unreadableDirectoryWarning(
                logicalDirectory,
                "A resolved skill directory escaped its configured source path.",
                undefined,
              ),
            );
            return;
          }
          const linkName = path.basename(logicalDirectory);
          const validLinkName = validateLinkName(linkName);
          if (!validLinkName.ok) {
            warnings.push({
              code: "INVALID_LINK_NAME",
              message: validLinkName.error.message,
              path: logicalDirectory,
            });
            return;
          }

          const parsed = parseSkillDocument(
            await readFile(skillFilePath),
            linkName,
          );
          candidates.push({
            contentFingerprint: parsed.contentFingerprint,
            displayName: parsed.displayName,
            id: createSkillCandidateId(source.id, relativePath),
            linkName: validLinkName.value,
            markdownBody: parsed.markdownBody,
            parseWarning: parsed.parseWarning,
            relativePath,
            skillDirectory: realDirectory,
            skillFilePath: path.join(realDirectory, "SKILL.md"),
            sourceId: source.id,
            summary: parsed.summary,
          });
          // A skill root deliberately terminates recursive traversal.
          return;
        }
      } catch (error: unknown) {
        if (systemErrorCode(error) !== "ENOENT") {
          warnings.push(
            unreadableDirectoryWarning(
              logicalDirectory,
              "SKILL.md could not be inspected while scanning this source.",
              error,
            ),
          );
          return;
        }
      }

      let entries;
      try {
        entries = await readdir(logicalDirectory, {
          encoding: "utf8",
          withFileTypes: true,
        });
      } catch (error: unknown) {
        warnings.push(
          unreadableDirectoryWarning(
            logicalDirectory,
            "A child directory could not be read while scanning this source.",
            error,
          ),
        );
        return;
      }

      const childDirectories: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue;
        }
        const childPath = path.join(logicalDirectory, entry.name);
        try {
          if ((await stat(childPath)).isDirectory()) {
            childDirectories.push(childPath);
          }
        } catch (error: unknown) {
          warnings.push(
            unreadableDirectoryWarning(
              childPath,
              "A child directory could not be inspected while scanning this source.",
              error,
            ),
          );
        }
      }

      childDirectories.sort((left, right) => left.localeCompare(right));
      for (const childDirectory of childDirectories) {
        await visit(childDirectory);
      }
    };

    await visit(sourcePath);
    return ok({
      candidates: candidates.sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      ),
      source,
      warnings,
    });
  }
}
