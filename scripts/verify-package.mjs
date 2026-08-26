import { gunzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifactsDirectory = path.join(rootDirectory, "artifacts");
const archives = (await readdir(artifactsDirectory)).filter((file) =>
  file.endsWith(".tgz"),
);

if (archives.length !== 1) {
  throw new Error("Run `npm run pack` before verifying the package archive.");
}

const archive = gunzipSync(
  await readFile(path.join(artifactsDirectory, archives[0])),
);
const decoder = new TextDecoder();
const names = new Set();
let offset = 0;

while (offset + 512 <= archive.length) {
  const header = archive.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) {
    break;
  }

  const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/, "");
  const prefix = decoder.decode(header.subarray(345, 500)).replace(/\0.*$/, "");
  const sizeText = decoder
    .decode(header.subarray(124, 136))
    .replace(/\0.*$/, "")
    .trim();
  const size = Number.parseInt(sizeText || "0", 8);

  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error(`Invalid tar entry size for ${name || "unknown entry"}.`);
  }

  names.add(prefix ? `${prefix}/${name}` : name);
  offset += 512 + Math.ceil(size / 512) * 512;
}

const requiredFiles = [
  "package/package.json",
  "package/dist/main.js",
  "package/dist/main.d.ts",
];
const missingFiles = requiredFiles.filter((file) => !names.has(file));
if (missingFiles.length > 0) {
  throw new Error(`Package archive is missing: ${missingFiles.join(", ")}`);
}

console.log(`Verified ${archives[0]} (${names.size} entries).`);
