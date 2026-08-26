import { type Stats } from "node:fs";
import { lstat, readlink, rename, rm, symlink } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "../shared/result.js";
import {
  normalizeDirectoryTarget,
  systemErrorCode,
} from "./path-normalization.js";
import {
  type CreateDirectoryLinkInput,
  type ExpectedManagedLink,
  type LinkInspection,
  type ManagedDirectoryLink,
  type PlatformLinkAdapter,
  type PlatformLinkErrorDetails,
  PlatformLinkError,
  type PlatformLinkType,
} from "./platform-link-adapter.js";
import { fingerprintTargetPath } from "./target-fingerprint.js";

interface NodeLinkFileSystem {
  lstat(path: string): Promise<Stats>;
  readlink(path: string): Promise<string>;
  rename(sourcePath: string, destinationPath: string): Promise<void>;
  rm(path: string, options: { force: boolean }): Promise<void>;
  symlink(
    targetPath: string,
    linkPath: string,
    type: "dir" | "junction",
  ): Promise<void>;
}

const nodeFileSystem: NodeLinkFileSystem = {
  lstat,
  readlink,
  rename,
  rm,
  symlink,
};
const windowsSymlinkFallbackCodes = new Set(["EACCES", "EPERM"]);

export interface NodePlatformLinkAdapterOptions {
  readonly fileSystem?: NodeLinkFileSystem;
  readonly platform?: NodeJS.Platform;
}

/** Node-backed adapter for managed directory symbolic links and Windows Junctions. */
export class NodePlatformLinkAdapter implements PlatformLinkAdapter {
  readonly #fileSystem: NodeLinkFileSystem;
  readonly #knownLinkTypes = new Map<string, PlatformLinkType>();
  readonly #platform: NodeJS.Platform;

  public constructor(options: NodePlatformLinkAdapterOptions = {}) {
    this.#fileSystem = options.fileSystem ?? nodeFileSystem;
    this.#platform = options.platform ?? process.platform;
  }

  public async createDirectoryLink(
    input: CreateDirectoryLinkInput,
  ): Promise<Result<ManagedDirectoryLink, PlatformLinkError>> {
    const normalizedTarget = await normalizeDirectoryTarget(input.targetPath);
    if (!normalizedTarget.ok) {
      return normalizedTarget;
    }

    const linkPath = path.resolve(input.linkPath);
    const existing = await this.inspectLink(linkPath);
    if (!existing.ok) {
      return existing;
    }
    if (existing.value.kind !== "missing") {
      return err(
        this.error("LINK_PATH_CONFLICT", "The link path already exists.", {
          linkPath,
        }),
      );
    }

    const created = await this.createWithPreferredLinkType(
      normalizedTarget.value,
      linkPath,
    );
    if (!created.ok) {
      return created;
    }

    this.#knownLinkTypes.set(linkPath, created.value);

    return ok({
      linkPath,
      linkType: created.value,
      targetPath: normalizedTarget.value,
      targetFingerprint: fingerprintTargetPath(
        normalizedTarget.value,
        this.#platform,
      ),
    });
  }

  public async inspectLink(
    linkPath: string,
  ): Promise<Result<LinkInspection, PlatformLinkError>> {
    const absoluteLinkPath = path.resolve(linkPath);
    let linkStats: Stats;

    try {
      linkStats = await this.#fileSystem.lstat(absoluteLinkPath);
    } catch (error: unknown) {
      if (systemErrorCode(error) === "ENOENT") {
        return ok({ kind: "missing" });
      }
      return err(
        this.error(
          "LINK_INSPECTION_FAILED",
          "The link path could not be inspected.",
          {
            linkPath: absoluteLinkPath,
            systemCode: systemErrorCode(error),
          },
        ),
      );
    }

    if (!linkStats.isSymbolicLink()) {
      if (linkStats.isDirectory()) {
        return ok({ kind: "directory" });
      }
      if (linkStats.isFile()) {
        return ok({ kind: "file" });
      }
      return ok({ kind: "other" });
    }

    let rawTarget: string;
    try {
      rawTarget = await this.#fileSystem.readlink(absoluteLinkPath);
    } catch (error: unknown) {
      return err(
        this.error(
          "LINK_INSPECTION_FAILED",
          "The link target could not be read.",
          {
            linkPath: absoluteLinkPath,
            systemCode: systemErrorCode(error),
          },
        ),
      );
    }

    const targetCandidate = resolveLinkTarget(
      absoluteLinkPath,
      rawTarget,
      this.#platform,
    );
    const target = await normalizeDirectoryTarget(targetCandidate);
    if (!target.ok) {
      if (target.error.code === "TARGET_NOT_FOUND") {
        return ok({
          kind: "link",
          dangling: true,
          linkType: this.linkTypeFor(absoluteLinkPath, rawTarget),
          rawTarget,
          targetFingerprint: null,
          targetPath: null,
        });
      }
      return target;
    }

    return ok({
      kind: "link",
      dangling: false,
      linkType: this.linkTypeFor(absoluteLinkPath, rawTarget),
      rawTarget,
      targetFingerprint: fingerprintTargetPath(target.value, this.#platform),
      targetPath: target.value,
    });
  }

  public async renameLink(
    sourcePath: string,
    destinationPath: string,
  ): Promise<Result<void, PlatformLinkError>> {
    const source = path.resolve(sourcePath);
    const destination = path.resolve(destinationPath);
    const sourceInspection = await this.inspectLink(source);
    if (!sourceInspection.ok) {
      return sourceInspection;
    }
    if (sourceInspection.value.kind !== "link") {
      return err(
        this.error("UNSAFE_LINK_OPERATION", "Only links may be renamed.", {
          linkPath: source,
        }),
      );
    }

    const destinationInspection = await this.inspectLink(destination);
    if (!destinationInspection.ok) {
      return destinationInspection;
    }
    if (destinationInspection.value.kind !== "missing") {
      return err(
        this.error(
          "LINK_PATH_CONFLICT",
          "The destination path already exists.",
          {
            linkPath: destination,
          },
        ),
      );
    }

    try {
      await this.#fileSystem.rename(source, destination);
      const knownType = this.#knownLinkTypes.get(source);
      if (knownType !== undefined) {
        this.#knownLinkTypes.delete(source);
        this.#knownLinkTypes.set(destination, knownType);
      }
      return ok(undefined);
    } catch (error: unknown) {
      return err(
        this.error(
          "LINK_RENAME_FAILED",
          "The managed link could not be renamed.",
          {
            linkPath: source,
            targetPath: destination,
            systemCode: systemErrorCode(error),
          },
        ),
      );
    }
  }

  public async removeManagedLink(
    linkPath: string,
    expected: ExpectedManagedLink,
  ): Promise<Result<void, PlatformLinkError>> {
    const absoluteLinkPath = path.resolve(linkPath);
    const inspection = await this.inspectLink(absoluteLinkPath);
    if (!inspection.ok) {
      return inspection;
    }

    if (
      inspection.value.kind !== "link" ||
      inspection.value.dangling ||
      inspection.value.linkType !== expected.linkType ||
      inspection.value.targetPath !== expected.targetPath ||
      inspection.value.targetFingerprint !== expected.targetFingerprint
    ) {
      return err(
        this.error(
          "MANAGED_LINK_MISMATCH",
          "The path is not the expected managed link.",
          {
            linkPath: absoluteLinkPath,
            targetPath: expected.targetPath,
          },
        ),
      );
    }

    try {
      await this.#fileSystem.rm(absoluteLinkPath, { force: false });
      this.#knownLinkTypes.delete(absoluteLinkPath);
      return ok(undefined);
    } catch (error: unknown) {
      return err(
        this.error(
          "LINK_REMOVE_FAILED",
          "The managed link could not be removed.",
          {
            linkPath: absoluteLinkPath,
            systemCode: systemErrorCode(error),
          },
        ),
      );
    }
  }

  private async createWithPreferredLinkType(
    targetPath: string,
    linkPath: string,
  ): Promise<Result<PlatformLinkType, PlatformLinkError>> {
    try {
      await this.#fileSystem.symlink(targetPath, linkPath, "dir");
      return ok("symlink");
    } catch (error: unknown) {
      const code = systemErrorCode(error);
      if (
        this.#platform !== "win32" ||
        code === undefined ||
        !windowsSymlinkFallbackCodes.has(code)
      ) {
        return err(
          this.error(
            "LINK_CREATION_FAILED",
            "The directory symbolic link could not be created.",
            {
              linkPath,
              targetPath,
              systemCode: code,
            },
          ),
        );
      }
    }

    try {
      await this.#fileSystem.symlink(targetPath, linkPath, "junction");
      return ok("junction");
    } catch (error: unknown) {
      return err(
        this.error(
          "JUNCTION_FALLBACK_FAILED",
          "The Windows Junction fallback could not be created.",
          {
            linkPath,
            targetPath,
            systemCode: systemErrorCode(error),
          },
        ),
      );
    }
  }

  private linkTypeFor(
    linkPath: string,
    rawTarget: string,
  ): PlatformLinkType | "unknown" {
    return (
      this.#knownLinkTypes.get(linkPath) ??
      inferLinkType(rawTarget, this.#platform)
    );
  }

  private error(
    code: string,
    message: string,
    details: PlatformLinkErrorDetails,
  ): PlatformLinkError {
    return new PlatformLinkError(message, code, details);
  }
}

function resolveLinkTarget(
  linkPath: string,
  rawTarget: string,
  platform: NodeJS.Platform,
): string {
  const pathApi = platform === "win32" ? path.win32 : path;
  const junctionTarget = rawTarget
    .replace(/^\\\?\?\\/, "")
    .replace(/^\\\\\?\\/, "");

  return pathApi.isAbsolute(junctionTarget)
    ? junctionTarget
    : pathApi.resolve(pathApi.dirname(linkPath), junctionTarget);
}

function inferLinkType(
  rawTarget: string,
  platform: NodeJS.Platform,
): PlatformLinkType | "unknown" {
  if (platform !== "win32") {
    return "symlink";
  }

  if (rawTarget.startsWith("\\??\\") || rawTarget.startsWith("\\\\?\\")) {
    return "junction";
  }

  return "unknown";
}
