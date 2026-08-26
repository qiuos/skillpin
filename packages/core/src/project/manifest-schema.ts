import { err, ok, type Result } from "../shared/result.js";
import { CoreError } from "../domain/errors.js";
import type { ManagedSkillLink } from "../domain/project-state.js";
import type { PlatformLinkType } from "../platform/platform-link-adapter.js";

export const PROJECT_MANIFEST_SCHEMA_VERSION = 1;

export interface ProjectManifest {
  readonly managedSkills: readonly ManagedSkillLink[];
  readonly revision: number;
  readonly schemaVersion: typeof PROJECT_MANIFEST_SCHEMA_VERSION;
}

interface LegacyProjectManifestV0 {
  readonly managedSkills: readonly ManagedSkillLink[];
  readonly schemaVersion: 0;
}

export type ParsedProjectManifest =
  | { readonly kind: "current"; readonly value: ProjectManifest }
  | { readonly kind: "legacy"; readonly value: LegacyProjectManifestV0 };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidManifest(
  fieldPath: string,
  message: string,
): Result<never, CoreError> {
  return err(
    new CoreError(
      message,
      "INVALID_PROJECT_MANIFEST",
      { fieldPath },
      false,
      "fix-file",
    ),
  );
}

function hasOnlyKeys(record: JsonRecord, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isSafePathSegment(value: string): boolean {
  return (
    value !== "" &&
    value !== "." &&
    value !== ".." &&
    !/[\\/\0<>:"|?*]/.test(value)
  );
}

function isSafeRelativePath(value: string): boolean {
  if (
    value === "" ||
    value.includes("\0") ||
    /^(?:[\\/]|[A-Za-z]:[\\/])/.test(value)
  ) {
    return false;
  }

  return value
    .split(/[\\/]/)
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function parseManagedSkills(
  value: unknown,
): Result<readonly ManagedSkillLink[], CoreError> {
  if (!Array.isArray(value)) {
    return invalidManifest(
      "managedSkills",
      "Project manifest managedSkills must be an array.",
    );
  }

  const conflictKeys = new Set<string>();
  const managedSkills: ManagedSkillLink[] = [];
  for (const [index, link] of value.entries()) {
    const fieldPath = `managedSkills[${index}]`;
    if (
      !isRecord(link) ||
      !hasOnlyKeys(link, [
        "linkName",
        "sourceId",
        "skillRelativePath",
        "linkType",
        "targetFingerprint",
      ])
    ) {
      return invalidManifest(
        fieldPath,
        "A managed skill has unsupported or invalid fields.",
      );
    }

    const {
      linkName,
      linkType,
      skillRelativePath,
      sourceId,
      targetFingerprint,
    } = link;
    if (
      typeof linkName !== "string" ||
      !isSafePathSegment(linkName) ||
      typeof sourceId !== "string" ||
      sourceId.trim() === "" ||
      typeof skillRelativePath !== "string" ||
      !isSafeRelativePath(skillRelativePath) ||
      (linkType !== "symlink" && linkType !== "junction") ||
      typeof targetFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(targetFingerprint)
    ) {
      return invalidManifest(
        fieldPath,
        "A managed skill contains an invalid or unsafe value.",
      );
    }

    const conflictKey = linkName.toLocaleLowerCase("en-US");
    if (conflictKeys.has(conflictKey)) {
      return invalidManifest(
        `${fieldPath}.linkName`,
        "Managed skill link names must be unique without regard to case.",
      );
    }
    conflictKeys.add(conflictKey);
    managedSkills.push({
      linkName,
      linkType: linkType as PlatformLinkType,
      skillRelativePath,
      sourceId,
      targetFingerprint,
    });
  }

  return ok(managedSkills);
}

function readSchemaVersion(record: JsonRecord): Result<number, CoreError> {
  return typeof record.schemaVersion === "number" &&
    Number.isInteger(record.schemaVersion) &&
    record.schemaVersion >= 0
    ? ok(record.schemaVersion)
    : invalidManifest(
        "schemaVersion",
        "Project manifest schemaVersion must be a non-negative integer.",
      );
}

export function createEmptyProjectManifest(): ProjectManifest {
  return {
    managedSkills: [],
    revision: 0,
    schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
  };
}

export function parseProjectManifest(
  value: unknown,
): Result<ParsedProjectManifest, CoreError> {
  if (!isRecord(value)) {
    return invalidManifest("$", "Project manifest must be a JSON object.");
  }

  const schemaVersion = readSchemaVersion(value);
  if (!schemaVersion.ok) {
    return schemaVersion;
  }
  if (schemaVersion.value > PROJECT_MANIFEST_SCHEMA_VERSION) {
    return err(
      new CoreError(
        "The project manifest was written by a newer version of SkillPin.",
        "SCHEMA_VERSION_UNSUPPORTED",
        { fieldPath: "schemaVersion" },
        false,
        "upgrade-skillpin",
      ),
    );
  }

  if (schemaVersion.value === 0) {
    if (!hasOnlyKeys(value, ["schemaVersion", "managedSkills"])) {
      return invalidManifest(
        "$",
        "Legacy project manifest has unsupported fields.",
      );
    }
    const managedSkills = parseManagedSkills(value.managedSkills);
    return managedSkills.ok
      ? ok({
          kind: "legacy",
          value: { managedSkills: managedSkills.value, schemaVersion: 0 },
        })
      : managedSkills;
  }

  if (!hasOnlyKeys(value, ["schemaVersion", "revision", "managedSkills"])) {
    return invalidManifest("$", "Project manifest has unsupported fields.");
  }
  if (
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 0
  ) {
    return invalidManifest(
      "revision",
      "Project manifest revision must be a non-negative integer.",
    );
  }

  const managedSkills = parseManagedSkills(value.managedSkills);
  return managedSkills.ok
    ? ok({
        kind: "current",
        value: {
          managedSkills: managedSkills.value,
          revision: value.revision,
          schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
        },
      })
    : managedSkills;
}

export function migrateProjectManifestV0(
  legacy: LegacyProjectManifestV0,
): ProjectManifest {
  return {
    managedSkills: legacy.managedSkills,
    revision: 0,
    schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
  };
}

export function validateProjectManifest(
  value: unknown,
): Result<ProjectManifest, CoreError> {
  const parsed = parseProjectManifest(value);
  if (!parsed.ok) {
    return parsed;
  }
  return parsed.value.kind === "current"
    ? ok(parsed.value.value)
    : invalidManifest(
        "schemaVersion",
        "Legacy project manifests must be migrated before they can be written.",
      );
}
