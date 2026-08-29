import {
  LOCAL_API_VERSION,
  type BootstrapSessionResponse,
  type LocalApiSuccess,
  type LocalSessionInfo,
} from "@skillpin/core";

import {
  clearSessionCookieHeader,
  SESSION_CREDENTIAL_COOKIE,
} from "../../security/session-cookie.js";

import type { LocalApiRoute } from "./types.js";

function success<T>(data: T): LocalApiSuccess<T> {
  return { data, version: LOCAL_API_VERSION };
}

function writeJson(
  response: import("node:http").ServerResponse,
  body: unknown,
  status = 200,
  headers: Record<string, string | readonly string[]> = {},
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

export function createSessionRoutes(): readonly LocalApiRoute[] {
  return [
    {
      method: "GET",
      path: "/api/health",
      handle: (_request, response) => {
        writeJson(response, success({ status: "ok" }));
      },
    },
    {
      method: "GET",
      path: "/api/session",
      handle: (_request, response, session) => {
        writeJson(response, success<LocalSessionInfo>(session.sessionInfo()));
      },
    },
    {
      method: "POST",
      path: "/api/session/shutdown",
      handle: (_request, response, session) => {
        writeJson(response, success({ status: "closing" }), 202, {
          "Set-Cookie": clearSessionCookieHeader(SESSION_CREDENTIAL_COOKIE),
        });
        queueMicrotask(() => {
          void session.close("api");
        });
      },
    },
  ];
}

export function bootstrapResponse(
  session: LocalSessionInfo,
  credential: string,
  credentialExpiresAt: Date,
): BootstrapSessionResponse {
  return {
    credential,
    credentialExpiresAt: credentialExpiresAt.toISOString(),
    session,
  };
}
