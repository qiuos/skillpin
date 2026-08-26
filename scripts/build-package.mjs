import { execFileSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
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
  "--workspace=@skillpin/cli",
  `--pack-destination=${artifactsDirectory}`,
];

const npmCliPath = process.env.npm_execpath;
if (process.platform === "win32" && npmCliPath === undefined) {
  throw new Error("Windows package build requires npm_execpath from npm run.");
}

execFileSync(
  process.platform === "win32" ? process.execPath : "npm",
  process.platform === "win32"
    ? [npmCliPath, ...npmPackArguments]
    : npmPackArguments,
  { cwd: rootDirectory, stdio: "inherit" },
);

const archives = (await readdir(artifactsDirectory)).filter((file) =>
  file.endsWith(".tgz"),
);
if (archives.length !== 1) {
  throw new Error(`Expected one CLI archive, found ${archives.length}.`);
}

console.log(`Created ${path.join("artifacts", archives[0])}`);
