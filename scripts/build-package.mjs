import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifactsDirectory = path.join(rootDirectory, "artifacts");

await rm(artifactsDirectory, { recursive: true, force: true });
await mkdir(artifactsDirectory, { recursive: true });

const npmPackArguments = [
  "pack",
  "--ignore-scripts",
  `--pack-destination=${artifactsDirectory}`,
];
const npmCacheDirectory = path.join(tmpdir(), "skillpin-npm-cache");
await mkdir(npmCacheDirectory, { recursive: true });
const npmCliPath = process.env.npm_execpath;
if (process.platform === "win32" && npmCliPath === undefined) {
  throw new Error("Windows package build requires npm_execpath from npm run.");
}

const stagingDirectory = await mkdtemp(path.join(tmpdir(), "skillpin-pack-"));
try {
  await mkdir(path.join(stagingDirectory, "docs"));
  for (const entry of [
    "dist",
    "docs/installation.md",
    "docs/troubleshooting.md",
    "docs/usage.md",
    "README.md",
    "README.en.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    await cp(
      path.join(rootDirectory, entry),
      path.join(stagingDirectory, entry),
      { recursive: true },
    );
  }
  const manifest = JSON.parse(
    await readFile(path.join(rootDirectory, "package.json"), "utf8"),
  );
  delete manifest.scripts.prepare;
  await writeFile(
    path.join(stagingDirectory, "package.json"),
    JSON.stringify(manifest, null, 2),
  );

  execFileSync(
    process.platform === "win32" ? process.execPath : "npm",
    process.platform === "win32"
      ? [npmCliPath, ...npmPackArguments]
      : npmPackArguments,
    {
      cwd: stagingDirectory,
      env: {
        ...process.env,
        npm_config_cache: npmCacheDirectory,
      },
      stdio: "inherit",
    },
  );

  const archives = (await readdir(artifactsDirectory)).filter((file) =>
    file.endsWith(".tgz"),
  );
  if (archives.length !== 1) {
    throw new Error(`Expected one SkillPin archive, found ${archives.length}.`);
  }

  console.log(`Created ${path.join("artifacts", archives[0])}`);
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
