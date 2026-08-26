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

execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  [
    "pack",
    "--workspace=@skillpin/cli",
    `--pack-destination=${artifactsDirectory}`,
  ],
  { cwd: rootDirectory, stdio: "inherit" },
);

const archives = (await readdir(artifactsDirectory)).filter((file) =>
  file.endsWith(".tgz"),
);
if (archives.length !== 1) {
  throw new Error(`Expected one CLI archive, found ${archives.length}.`);
}

console.log(`Created ${path.join("artifacts", archives[0])}`);
