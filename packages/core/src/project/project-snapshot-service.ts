import { lstat, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  type ManagedSkillLink,
  type ProjectSnapshot,
  type ProjectSourceState,
} from "../domain/project-state.js";
import { CoreError } from "../domain/errors.js";
import { fingerprintTargetPath } from "../platform/target-fingerprint.js";
import type { PlatformLinkAdapter } from "../platform/platform-link-adapter.js";
import { err, ok, type Result } from "../shared/result.js";
import {
  getProjectManifestPath,
  ProjectManifestRepository,
} from "./manifest-repository.js";
import { classifyProjectLink } from "./project-state-classifier.js";
import { diagnoseProjectRecoveryArtifacts } from "./recovery-diagnostics.js";

export interface ProjectSourceHealth {
  readonly enabled: boolean;
  readonly id: string;
}

export interface ProjectSnapshotServiceOptions {
  readonly adapter: PlatformLinkAdapter;
  readonly manifestRepository?: ProjectManifestRepository | undefined;
  readonly projectDirectory: string;
  readonly sources?: readonly ProjectSourceHealth[] | undefined;
}

/** Node-only project inspector; it never creates `.agents` or alters disk. */
export class ProjectSnapshotService {
  readonly #adapter: PlatformLinkAdapter;
  readonly #manifestRepository: ProjectManifestRepository;
  readonly #projectDirectory: string;
  readonly #sourceStateById: ReadonlyMap<string, ProjectSourceState>;

  public constructor(options: ProjectSnapshotServiceOptions) {
    this.#adapter = options.adapter;
    this.#projectDirectory = path.resolve(options.projectDirectory);
    this.#manifestRepository =
      options.manifestRepository ??
      new ProjectManifestRepository({
        filePath: getProjectManifestPath(this.#projectDirectory),
      });
    this.#sourceStateById = new Map(
      (options.sources ?? []).map((source) => [
        source.id,
        source.enabled ? "available" : "disabled",
      ]),
    );
  }

  public get projectDirectory(): string {
    return this.#projectDirectory;
  }

  public async inspect(): Promise<Result<ProjectSnapshot, CoreError>> {
    const project = await directoryExists(this.#projectDirectory);
    if (!project) {
      return err(
        new CoreError(
          "The target project directory does not exist or is not a directory.",
          "PROJECT_NOT_DIRECTORY",
          { filePath: this.#projectDirectory },
          false,
          "choose-directory",
        ),
      );
    }

    const manifest = await this.#manifestRepository.load();
    if (!manifest.ok) {
      return manifest;
    }

    const agentsDirectory = path.join(this.#projectDirectory, ".agents");
    const agentsState = await existingPathKind(agentsDirectory);
    if (agentsState !== "missing" && agentsState !== "directory") {
      return err(structureError(agentsDirectory));
    }
    const skillsDirectory = path.join(agentsDirectory, "skills");
    const skillsState = await existingPathKind(skillsDirectory);
    if (skillsState !== "missing" && skillsState !== "directory") {
      return err(structureError(skillsDirectory));
    }

    const managedByName = new Map(
      manifest.value.value.managedSkills.map((link) => [
        conflictKey(link.linkName),
        link,
      ]),
    );
    const names = new Map<string, string>();
    for (const link of manifest.value.value.managedSkills) {
      names.set(conflictKey(link.linkName), link.linkName);
    }
    if (skillsState === "directory") {
      for (const entry of await readdir(skillsDirectory)) {
        names.set(conflictKey(entry), entry);
      }
    }

    const links = await Promise.all(
      [...names.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(async ([key, linkName]) => {
          const managedLink = managedByName.get(key) ?? null;
          return classifyProjectLink({
            adapter: this.#adapter,
            linkName,
            linkPath: path.join(skillsDirectory, linkName),
            managedLink,
            sourceState:
              managedLink === null
                ? undefined
                : (this.#sourceStateById.get(managedLink.sourceId) ??
                  "unconfigured"),
          });
        }),
    );

    const manifestPath = getProjectManifestPath(this.#projectDirectory);
    const recoveryDiagnostics = await diagnoseProjectRecoveryArtifacts(
      skillsDirectory,
      manifestPath,
    );
    return ok({
      links,
      manifestRevision: manifest.value.value.revision,
      projectFingerprint: fingerprintTargetPath(this.#projectDirectory),
      recoveryDiagnostics,
    });
  }
}

function conflictKey(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

async function directoryExists(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function existingPathKind(
  candidate: string,
): Promise<"directory" | "missing" | "other"> {
  try {
    return (await lstat(candidate)).isDirectory() ? "directory" : "other";
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "missing";
    }
    return "other";
  }
}

function structureError(filePath: string): CoreError {
  return new CoreError(
    "The SkillPin project directory structure is occupied by a non-directory.",
    "PROJECT_STRUCTURE_CONFLICT",
    { filePath },
    false,
    "review-state",
  );
}

export function managedLinkIdentity(link: ManagedSkillLink): string {
  return `${link.sourceId}:${link.skillRelativePath}`;
}
