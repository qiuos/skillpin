import type { IncomingMessage, ServerResponse } from "node:http";

import {
  LOCAL_API_VERSION,
  type LocalApiError,
  type LocalApiSuccess,
} from "@skillpin/core";

import type { LocalApiRoute } from "./types.js";

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

function writeError(
  response: ServerResponse,
  status: number,
  error: LocalApiError,
): void {
  writeJson(response, { error, version: LOCAL_API_VERSION }, status);
}

function requestError(message: string): LocalApiError {
  return {
    code: "API_REQUEST_INVALID",
    message,
    recoveryAction: "review-state",
    retryable: false,
  };
}

function errorFrom(error: {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}): LocalApiError {
  return {
    code: error.code,
    message: error.message,
    recoveryAction: error.retryable ? "retry" : "review-state",
    retryable: error.retryable,
  };
}

function candidateIdFrom(request: IncomingMessage): string | null {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const match = /^\/api\/catalog\/candidates\/([^/]+)$/.exec(pathname);
  if (match === null) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/** P8 read-only catalog routes. Detail content is available only by candidate id. */
export function createCatalogRoutes(): readonly LocalApiRoute[] {
  return [
    {
      method: "GET",
      path: "/api/catalog",
      async handle(request, response, session) {
        const url = new URL(request.url ?? "/", "http://localhost");
        const catalog = await session.sourceRuntime.catalog(
          url.searchParams.get("query") ?? "",
        );
        if (!catalog.ok) {
          writeError(response, 422, errorFrom(catalog.error));
          return;
        }
        writeJson(response, success(catalog.value));
      },
    },
    {
      method: "GET",
      path: /^\/api\/catalog\/candidates\/[^/]+$/,
      async handle(request, response, session) {
        const candidateId = candidateIdFrom(request);
        if (candidateId === null || candidateId.trim() === "") {
          writeError(
            response,
            400,
            requestError("A valid skill candidate id is required."),
          );
          return;
        }
        const candidate =
          await session.sourceRuntime.catalogCandidate(candidateId);
        if (!candidate.ok) {
          writeError(response, 422, errorFrom(candidate.error));
          return;
        }
        writeJson(response, success(candidate.value));
      },
    },
  ];
}
