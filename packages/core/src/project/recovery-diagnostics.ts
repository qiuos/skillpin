import { readdir } from "node:fs/promises";
import path from "node:path";

import type { ProjectRecoveryDiagnostic } from "../domain/project-state.js";

const temporaryMarker = ".skillpin-tmp-";
const backupMarker = ".skillpin-backup-";

/** Lists residue for human review only; P4 never deletes unproven leftovers. */
export async function diagnoseProjectRecoveryArtifacts(
  skillsDirectory: string,
  manifestPath: string,
): Promise<readonly ProjectRecoveryDiagnostic[]> {
  const diagnostics: ProjectRecoveryDiagnostic[] = [];
  const inspectDirectory = async (directory: string): Promise<void> => {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const kind = residueKind(entry.name);
        if (kind !== null) {
          diagnostics.push({
            kind,
            path: path.join(directory, entry.name),
            safeToDelete: false,
          });
        }
      }
    } catch (error: unknown) {
      if (!isMissingError(error)) {
        throw error;
      }
    }
  };

  await inspectDirectory(skillsDirectory);
  await inspectDirectory(path.dirname(manifestPath));
  return diagnostics.sort((left, right) => left.path.localeCompare(right.path));
}

export function projectTemporaryPath(
  finalPath: string,
  requestId: string,
): string {
  return siblingPath(finalPath, `tmp-${requestId}`);
}

export function projectBackupPath(
  finalPath: string,
  requestId: string,
): string {
  return siblingPath(finalPath, `backup-${requestId}`);
}

function residueKind(name: string): "backup" | "temporary" | null {
  if (name.includes(backupMarker)) {
    return "backup";
  }
  return name.includes(temporaryMarker) ? "temporary" : null;
}

function siblingPath(finalPath: string, marker: string): string {
  return path.join(
    path.dirname(path.resolve(finalPath)),
    `.${path.basename(finalPath)}.skillpin-${marker}`,
  );
}

function isMissingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
