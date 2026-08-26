import { err, ok, type Result } from "../shared/result.js";
import { CoreError } from "../domain/errors.js";
import type { SkillSource } from "../domain/skill-source.js";

export const USER_CONFIG_SCHEMA_VERSION = 1;

export interface UserConfig {
  readonly preferences: {
    readonly theme: "system";
  };
  readonly schemaVersion: typeof USER_CONFIG_SCHEMA_VERSION;
  readonly sources: readonly SkillSource[];
}

export interface LegacyUserConfigV0 {
  readonly schemaVersion: 0;
  readonly sources: readonly SkillSource[];
}

export type ParsedUserConfig =
  | { readonly kind: "current"; readonly value: UserConfig }
  | { readonly kind: "legacy"; readonly value: LegacyUserConfigV0 };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidUserConfig(
  fieldPath: string,
  message: string,
): Result<never, CoreError> {
  return err(
    new CoreError(
      message,
      "INVALID_USER_CONFIG",
      { fieldPath },
      false,
      "fix-file",
    ),
  );
}

function hasOnlyKeys(record: JsonRecord, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function parseSources(
  value: unknown,
): Result<readonly SkillSource[], CoreError> {
  if (!Array.isArray(value)) {
    return invalidUserConfig(
      "sources",
      "User configuration sources must be an array.",
    );
  }

  const ids = new Set<string>();
  const sources: SkillSource[] = [];
  for (const [index, source] of value.entries()) {
    const fieldPath = `sources[${index}]`;
    if (
      !isRecord(source) ||
      !hasOnlyKeys(source, ["id", "displayName", "path", "enabled"])
    ) {
      return invalidUserConfig(
        fieldPath,
        "A skill source has unsupported or invalid fields.",
      );
    }

    const { displayName, enabled, id, path } = source;
    if (
      typeof id !== "string" ||
      id.trim() === "" ||
      typeof displayName !== "string" ||
      displayName.trim() === "" ||
      typeof path !== "string" ||
      path.trim() === "" ||
      typeof enabled !== "boolean"
    ) {
      return invalidUserConfig(
        fieldPath,
        "A skill source contains an invalid value.",
      );
    }
    if (ids.has(id)) {
      return invalidUserConfig(
        `${fieldPath}.id`,
        "Skill source identifiers must be unique.",
      );
    }

    ids.add(id);
    sources.push({ displayName, enabled, id, path });
  }

  return ok(sources);
}

function readSchemaVersion(record: JsonRecord): Result<number, CoreError> {
  const { schemaVersion } = record;
  return typeof schemaVersion === "number" &&
    Number.isInteger(schemaVersion) &&
    schemaVersion >= 0
    ? ok(schemaVersion)
    : invalidUserConfig(
        "schemaVersion",
        "User configuration schemaVersion must be a non-negative integer.",
      );
}

export function createDefaultUserConfig(): UserConfig {
  return {
    preferences: { theme: "system" },
    schemaVersion: USER_CONFIG_SCHEMA_VERSION,
    sources: [],
  };
}

export function parseUserConfig(
  value: unknown,
): Result<ParsedUserConfig, CoreError> {
  if (!isRecord(value)) {
    return invalidUserConfig("$", "User configuration must be a JSON object.");
  }

  const schemaVersion = readSchemaVersion(value);
  if (!schemaVersion.ok) {
    return schemaVersion;
  }
  if (schemaVersion.value > USER_CONFIG_SCHEMA_VERSION) {
    return err(
      new CoreError(
        "The user configuration was written by a newer version of SkillPin.",
        "SCHEMA_VERSION_UNSUPPORTED",
        { fieldPath: "schemaVersion" },
        false,
        "upgrade-skillpin",
      ),
    );
  }

  if (schemaVersion.value === 0) {
    if (!hasOnlyKeys(value, ["schemaVersion", "sources"])) {
      return invalidUserConfig(
        "$",
        "Legacy user configuration has unsupported fields.",
      );
    }
    const sources = parseSources(value.sources);
    return sources.ok
      ? ok({
          kind: "legacy",
          value: { schemaVersion: 0, sources: sources.value },
        })
      : sources;
  }

  if (!hasOnlyKeys(value, ["schemaVersion", "preferences", "sources"])) {
    return invalidUserConfig("$", "User configuration has unsupported fields.");
  }
  if (
    !isRecord(value.preferences) ||
    value.preferences.theme !== "system" ||
    !hasOnlyKeys(value.preferences, ["theme"])
  ) {
    return invalidUserConfig(
      "preferences",
      "User configuration preferences must use the supported theme.",
    );
  }
  const sources = parseSources(value.sources);
  return sources.ok
    ? ok({
        kind: "current",
        value: {
          preferences: { theme: "system" },
          schemaVersion: USER_CONFIG_SCHEMA_VERSION,
          sources: sources.value,
        },
      })
    : sources;
}

export function migrateUserConfigV0(legacy: LegacyUserConfigV0): UserConfig {
  return {
    preferences: { theme: "system" },
    schemaVersion: USER_CONFIG_SCHEMA_VERSION,
    sources: legacy.sources,
  };
}

export function validateUserConfig(
  value: unknown,
): Result<UserConfig, CoreError> {
  const parsed = parseUserConfig(value);
  if (!parsed.ok) {
    return parsed;
  }
  return parsed.value.kind === "current"
    ? ok(parsed.value.value)
    : invalidUserConfig(
        "schemaVersion",
        "Legacy user configuration must be migrated before it can be written.",
      );
}
