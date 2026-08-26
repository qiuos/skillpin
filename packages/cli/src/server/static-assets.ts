import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface StaticAsset {
  readonly body: Buffer;
  readonly contentType: string;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function requestedSegments(requestTarget: string): readonly string[] | null {
  const queryStart = requestTarget.indexOf("?");
  const rawPath =
    queryStart < 0 ? requestTarget : requestTarget.slice(0, queryStart);
  if (!rawPath.startsWith("/")) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) {
    return null;
  }

  const segments = decoded.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return segments.length === 0 ? ["index.html"] : segments;
}

function contentTypeFor(filePath: string): string | null {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? null;
}

function isDescendant(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

/** Reads a package-relative Vite asset without permitting an HTTP path to escape its static root. */
export async function readStaticAsset(
  staticDirectory: string,
  requestTarget: string,
): Promise<StaticAsset | null> {
  const segments = requestedSegments(requestTarget);
  if (segments === null) {
    return null;
  }

  let staticRoot: string;
  let resolvedFile: string;
  try {
    staticRoot = await realpath(staticDirectory);
    const requestedFile = path.resolve(staticRoot, ...segments);
    if (!isDescendant(staticRoot, requestedFile)) {
      return null;
    }
    resolvedFile = await realpath(requestedFile);
  } catch {
    return null;
  }
  if (!isDescendant(staticRoot, resolvedFile)) {
    return null;
  }

  const contentType = contentTypeFor(resolvedFile);
  if (contentType === null) {
    return null;
  }
  try {
    if (!(await stat(resolvedFile)).isFile()) {
      return null;
    }
    return { body: await readFile(resolvedFile), contentType };
  } catch {
    return null;
  }
}
