import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifactsDirectory = path.join(rootDirectory, "artifacts");
const decoder = new TextDecoder();
const requiredDocuments = [
  "package/README.md",
  "package/README.en.md",
  "package/THIRD_PARTY_NOTICES.md",
  "package/docs/installation.md",
  "package/docs/releasing.md",
  "package/docs/troubleshooting.md",
  "package/docs/usage.md",
];
const requiredFiles = [
  "package/package.json",
  "package/dist/main.js",
  "package/dist/web/index.html",
  ...requiredDocuments,
];
const allowedWebExtensions = new Set([
  ".avif",
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".png",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
]);

function tarText(buffer, start, length) {
  return decoder
    .decode(buffer.subarray(start, start + length))
    .replace(/\0.*$/, "");
}

function parseTar(archive) {
  const entries = new Map();
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const name = tarText(header, 0, 100);
    const prefix = tarText(header, 345, 155);
    const sizeText = tarText(header, 124, 12).trim();
    const modeText = tarText(header, 100, 8).trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const mode = Number.parseInt(modeText || "0", 8);
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      !Number.isSafeInteger(mode)
    ) {
      throw new Error(`Invalid tar header for ${name || "unknown entry"}.`);
    }
    const entryName = prefix ? `${prefix}/${name}` : name;
    const type = String.fromCharCode(header[156] ?? 0);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    if (contentEnd > archive.length || entries.has(entryName)) {
      throw new Error(`Malformed tar entry ${entryName || "unknown entry"}.`);
    }
    if (type === "" || type === "0" || type === "\0") {
      entries.set(entryName, {
        content: archive.subarray(contentStart, contentEnd),
        mode,
      });
    } else if (type !== "5") {
      throw new Error(`Archive contains unsupported tar entry ${entryName}.`);
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isAllowedFile(name) {
  if (requiredFiles.includes(name)) {
    return true;
  }
  if (!name.startsWith("package/dist/web/assets/")) {
    return false;
  }
  return allowedWebExtensions.has(path.extname(name).toLowerCase());
}

function text(entries, name) {
  const entry = entries.get(name);
  if (entry === undefined) {
    throw new Error(`Package archive is missing: ${name}`);
  }
  return decoder.decode(entry.content);
}

const archives = (await readdir(artifactsDirectory)).filter((file) =>
  file.endsWith(".tgz"),
);
if (archives.length !== 1) {
  throw new Error("Run `npm run pack` before verifying the package archive.");
}

const entries = parseTar(
  gunzipSync(await readFile(path.join(artifactsDirectory, archives[0]))),
);
const missingFiles = requiredFiles.filter((file) => !entries.has(file));
assert(
  missingFiles.length === 0,
  `Package archive is missing: ${missingFiles.join(", ")}`,
);

for (const [name, entry] of entries) {
  assert(
    isAllowedFile(name),
    `Package archive contains forbidden file: ${name}`,
  );
  assert(
    !name.endsWith(".map"),
    `Package archive contains source map: ${name}`,
  );
  assert(
    !/(?:^|\/)(?:tests?|fixtures?|src)(?:\/|$)/.test(name),
    `Package archive contains development artifact: ${name}`,
  );
  assert(
    name === "package/dist/main.js" || (entry.mode & 0o111) === 0,
    `Package archive contains unexpected executable payload: ${name}`,
  );
}

const manifest = JSON.parse(text(entries, "package/package.json"));
assert(manifest.name === "skillpin", "Package name must be skillpin.");
assert(
  manifest.bin?.skillpin === "./dist/main.js",
  "Package bin.skillpin must target ./dist/main.js.",
);
assert(
  Array.isArray(manifest.files) && manifest.files.includes("dist"),
  "Package files must explicitly include dist.",
);
assert(
  Array.isArray(manifest.files) && manifest.files.includes("docs"),
  "Package files must explicitly include delivery docs.",
);
assert(
  manifest.dependencies?.["@skillpin/core"] === undefined,
  "Package must not depend on the unpublished @skillpin/core workspace.",
);
assert(
  manifest.license === "UNLICENSED",
  "Package must declare its delivery license status.",
);
assert(
  manifest.publishConfig?.access === "restricted",
  "Package must require restricted publish access.",
);

const main = text(entries, "package/dist/main.js");
assert(
  main.startsWith("#!/usr/bin/env node"),
  "CLI bundle must retain its Node shebang.",
);
assert(
  !main.includes("sourceMappingURL"),
  "CLI bundle must not include source maps.",
);
assert(
  !main.includes(rootDirectory) && !main.includes("packages/cli/src"),
  "CLI bundle must not contain local source paths.",
);

const html = text(entries, "package/dist/web/index.html");
assert(
  html.includes('<div id="root"></div>'),
  "Web entry must be the Vite production application.",
);
const referencedAssets = [
  ...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g),
].map((match) => match[1].split("?")[0]);
assert(
  referencedAssets.length > 0,
  "Web entry must reference packaged production assets.",
);
for (const assetPath of referencedAssets) {
  assert(
    entries.has(`package/dist/web${assetPath}`),
    `Web entry references missing asset: ${assetPath}`,
  );
}

const notices = text(entries, "package/THIRD_PARTY_NOTICES.md");
assert(
  notices.includes("yaml") && notices.includes("ISC"),
  "Third-party notices must include runtime dependency and license inventory.",
);

console.log(
  `Verified ${archives[0]} (${entries.size} files; ${referencedAssets.length} web assets referenced).`,
);
