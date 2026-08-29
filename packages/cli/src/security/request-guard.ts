import type { IncomingHttpHeaders } from "node:http";

import { tokensEqual } from "./session-token.js";

export type RequestGuardFailure =
  "invalid-credential" | "invalid-host" | "invalid-origin" | "non-loopback";

export interface LoopbackSocket {
  readonly remoteAddress?: string | undefined;
}

export interface RequestGuardOptions {
  readonly origin: string;
  readonly port: number;
}

function isLoopbackAddress(address: string | undefined): boolean {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Rejects DNS-rebinding, remote, and cross-origin requests before route handling. */
export function guardLocalRequest(
  headers: IncomingHttpHeaders,
  socket: LoopbackSocket,
  options: RequestGuardOptions,
  requireOrigin: boolean,
): RequestGuardFailure | null {
  if (!isLoopbackAddress(socket.remoteAddress)) {
    return "non-loopback";
  }
  const host = headerValue(headers, "host");
  if (host !== `127.0.0.1:${options.port}`) {
    return "invalid-host";
  }
  const origin = headerValue(headers, "origin");
  if (origin !== undefined) {
    if (origin !== options.origin) {
      return "invalid-origin";
    }
    return null;
  }
  // Chromium omits Origin for same-origin GET fetches. Sec-Fetch-Site preserves
  // the browser boundary without weakening the loopback, host, or credential checks.
  if (
    requireOrigin &&
    headerValue(headers, "sec-fetch-site") !== "same-origin"
  ) {
    return "invalid-origin";
  }
  return null;
}

function isValidCredential(
  candidate: string | undefined,
  credentials: ReadonlyMap<string, number>,
  now: number,
): boolean {
  if (candidate === undefined) {
    return false;
  }
  for (const [credential, expiresAt] of credentials) {
    if (expiresAt > now && tokensEqual(candidate, credential)) {
      return true;
    }
  }
  return false;
}

export function hasValidCredential(
  headers: IncomingHttpHeaders,
  credentials: ReadonlyMap<string, number>,
  now: number,
): boolean {
  const authorization = headerValue(headers, "authorization");
  return isValidCredential(
    authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined,
    credentials,
    now,
  );
}

/** Validates the short-lived HttpOnly browser-session credential cookie. */
export function hasValidCredentialCookie(
  headers: IncomingHttpHeaders,
  cookieName: string,
  credentials: ReadonlyMap<string, number>,
  now: number,
): boolean {
  return isValidCredential(readCookie(headers, cookieName), credentials, now);
}

export function readCookie(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const cookie = headerValue(headers, "cookie");
  if (cookie === undefined) {
    return undefined;
  }
  const prefix = `${name}=`;
  for (const item of cookie.split(";")) {
    const trimmed = item.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return undefined;
}

/** Browser WebSocket credentials travel in a protocol token, never a URL query. */
export function hasWebSocketProtocol(
  headers: IncomingHttpHeaders,
  expectedProtocol: string,
): boolean {
  const protocol = headerValue(headers, "sec-websocket-protocol");
  return (
    protocol
      ?.split(",")
      .map((value) => value.trim())
      .includes(expectedProtocol) ?? false
  );
}

export function readWebSocketCredential(
  headers: IncomingHttpHeaders,
): string | undefined {
  const protocol = headerValue(headers, "sec-websocket-protocol");
  if (protocol === undefined) {
    return undefined;
  }
  const prefix = "skillpin.credential.";
  return protocol
    .split(",")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}
