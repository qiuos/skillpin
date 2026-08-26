import { homedir } from "node:os";
import path from "node:path";

export interface UserConfigLocationOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory?: string;
  readonly platform?: NodeJS.Platform;
}

function pathApiFor(platform: NodeJS.Platform): typeof path.posix {
  return platform === "win32" ? path.win32 : path.posix;
}

/** Returns the standard user-scoped location for SkillPin's JSON configuration. */
export function getUserConfigPath(
  options: UserConfigLocationOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const homeDirectory = options.homeDirectory ?? environment.HOME ?? homedir();
  const pathApi = pathApiFor(platform);

  if (platform === "darwin") {
    return pathApi.join(
      homeDirectory,
      "Library",
      "Application Support",
      "skillpin",
      "config.json",
    );
  }

  if (platform === "win32") {
    const applicationData =
      environment.APPDATA ?? pathApi.join(homeDirectory, "AppData", "Roaming");
    return pathApi.join(applicationData, "skillpin", "config.json");
  }

  return pathApi.join(
    environment.XDG_CONFIG_HOME ?? pathApi.join(homeDirectory, ".config"),
    "skillpin",
    "config.json",
  );
}
