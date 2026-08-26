import type { IncomingMessage, ServerResponse } from "node:http";

import {
  LOCAL_API_VERSION,
  type LocalApiError,
  type LocalApiSuccess,
  type LocalSourceInput,
} from "@skillpin/core";

import type { LocalApiRoute } from "./types.js";

const MAX_REQUEST_BODY_BYTES = 32 * 1024;

function success<T>(data: T): LocalApiSuccess<T> {
  return { data, version: LOCAL_API_VERSION };
}

function writeJson(
  response: ServerResponse,
  body: unknown,
  status = 200,
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function requestError(message: string): LocalApiError {
  return {
    code: "API_REQUEST_INVALID",
    message,
    recoveryAction: "review-state",
    retryable: false,
  };
}

function sourceError(error: {
  readonly code: string;
  readonly message: string;
  readonly recoveryAction: "open-session" | "retry" | "review-state";
  readonly retryable: boolean;
}): LocalApiError {
  return error;
}

function writeError(
  response: ServerResponse,
  status: number,
  error: LocalApiError,
): void {
  writeJson(response, { error, version: LOCAL_API_VERSION }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSourceInput(value: unknown): value is LocalSourceInput {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.displayName === "string" &&
    typeof value.path === "string" &&
    (value.enabled === undefined || typeof value.enabled === "boolean")
  );
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > MAX_REQUEST_BODY_BYTES) {
      throw new Error("too-large");
    }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (body === "") {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("invalid-json");
  }
}

function sourceIdFrom(request: IncomingMessage): string | null {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const match = /^\/api\/sources\/([^/]+)(?:\/scan)?$/.exec(pathname);
  if (match === null) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

async function sourceInputFrom(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<LocalSourceInput | null> {
  try {
    const body = await readJson(request);
    if (!isSourceInput(body)) {
      writeError(
        response,
        400,
        requestError("A source requires a display name and directory path."),
      );
      return null;
    }
    return body;
  } catch {
    writeError(
      response,
      400,
      requestError("The request body must be valid JSON."),
    );
    return null;
  }
}

export function createSourceRoutes(): readonly LocalApiRoute[] {
  return [
    {
      method: "GET",
      path: "/api/sources",
      async handle(_request, response, session) {
        const sources = await session.sourceRuntime.list();
        if (!sources.ok) {
          writeError(
            response,
            422,
            sourceError({
              code: sources.error.code,
              message: sources.error.message,
              recoveryAction: sources.error.retryable
                ? "retry"
                : "review-state",
              retryable: sources.error.retryable,
            }),
          );
          return;
        }
        writeJson(response, success(sources.value));
      },
    },
    {
      method: "POST",
      path: "/api/sources",
      async handle(request, response, session) {
        const input = await sourceInputFrom(request, response);
        if (input === null) {
          return;
        }
        const created = await session.sourceRuntime.add(input);
        if (!created.ok) {
          writeError(
            response,
            422,
            sourceError({
              code: created.error.code,
              message: created.error.message,
              recoveryAction: created.error.retryable
                ? "retry"
                : "review-state",
              retryable: created.error.retryable,
            }),
          );
          return;
        }
        writeJson(response, success(created.value), 201);
      },
    },
    {
      method: "POST",
      path: "/api/sources/validate",
      async handle(request, response, session) {
        try {
          const body = await readJson(request);
          if (!isRecord(body) || typeof body.path !== "string") {
            writeError(
              response,
              400,
              requestError("A directory path is required."),
            );
            return;
          }
          const validated = await session.sourceRuntime.validatePath(body.path);
          if (!validated.ok) {
            writeError(
              response,
              422,
              sourceError({
                code: validated.error.code,
                message: validated.error.message,
                recoveryAction: validated.error.retryable
                  ? "retry"
                  : "review-state",
                retryable: validated.error.retryable,
              }),
            );
            return;
          }
          writeJson(response, success(validated.value));
        } catch {
          writeError(
            response,
            400,
            requestError("The request body must be valid JSON."),
          );
        }
      },
    },
    {
      method: "PATCH",
      path: /^\/api\/sources\/[^/]+$/,
      async handle(request, response, session) {
        const sourceId = sourceIdFrom(request);
        if (sourceId === null) {
          writeError(
            response,
            400,
            requestError("A source identifier is required."),
          );
          return;
        }
        const input = await sourceInputFrom(request, response);
        if (input === null) {
          return;
        }
        const updated = await session.sourceRuntime.update(sourceId, input);
        if (!updated.ok) {
          writeError(
            response,
            422,
            sourceError({
              code: updated.error.code,
              message: updated.error.message,
              recoveryAction: updated.error.retryable
                ? "retry"
                : "review-state",
              retryable: updated.error.retryable,
            }),
          );
          return;
        }
        writeJson(response, success(updated.value));
      },
    },
    {
      method: "POST",
      path: /^\/api\/sources\/[^/]+\/scan$/,
      async handle(request, response, session) {
        const sourceId = sourceIdFrom(request);
        if (sourceId === null) {
          writeError(
            response,
            400,
            requestError("A source identifier is required."),
          );
          return;
        }
        const rescanned = await session.sourceRuntime.rescan(sourceId);
        if (!rescanned.ok) {
          writeError(
            response,
            422,
            sourceError({
              code: rescanned.error.code,
              message: rescanned.error.message,
              recoveryAction: rescanned.error.retryable
                ? "retry"
                : "review-state",
              retryable: rescanned.error.retryable,
            }),
          );
          return;
        }
        writeJson(response, success(rescanned.value));
      },
    },
    {
      method: "DELETE",
      path: /^\/api\/sources\/[^/]+$/,
      async handle(request, response, session) {
        const sourceId = sourceIdFrom(request);
        if (sourceId === null) {
          writeError(
            response,
            400,
            requestError("A source identifier is required."),
          );
          return;
        }
        try {
          const body = await readJson(request);
          const confirmed =
            isRecord(body) && body.confirmProjectImpact === true;
          const removed = await session.sourceRuntime.remove(
            sourceId,
            confirmed,
          );
          if (!removed.ok) {
            writeError(
              response,
              422,
              sourceError({
                code: removed.error.code,
                message: removed.error.message,
                recoveryAction: removed.error.retryable
                  ? "retry"
                  : "review-state",
                retryable: removed.error.retryable,
              }),
            );
            return;
          }
          writeJson(response, success(removed.value));
        } catch {
          writeError(
            response,
            400,
            requestError("The request body must be valid JSON."),
          );
        }
      },
    },
    {
      method: "GET",
      path: "/api/directories/entrypoints",
      handle(_request, response, session) {
        writeJson(
          response,
          success({ entries: session.sourceRuntime.entrypoints() }),
        );
      },
    },
    {
      method: "GET",
      path: "/api/directories",
      async handle(request, response, session) {
        const url = new URL(request.url ?? "/", "http://localhost");
        const directoryPath = url.searchParams.get("path");
        if (directoryPath === null || directoryPath.trim() === "") {
          writeError(
            response,
            400,
            requestError("A directory path is required."),
          );
          return;
        }
        const listing = await session.sourceRuntime.directories(directoryPath);
        if (!listing.ok) {
          writeError(
            response,
            422,
            sourceError({
              code: listing.error.code,
              message: listing.error.message,
              recoveryAction: listing.error.retryable
                ? "retry"
                : "review-state",
              retryable: listing.error.retryable,
            }),
          );
          return;
        }
        writeJson(response, success(listing.value));
      },
    },
  ];
}
