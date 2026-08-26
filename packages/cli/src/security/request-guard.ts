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
  if ((requireOrigin || origin !== undefined) && origin !== options.origin) {
    return "invalid-origin";
  }
  return null;
}

export function hasValidCredential(
  headers: IncomingHttpHeaders,
  credentials: ReadonlyMap<string, number>,
  now: number,
): boolean {
  const authorization = headerValue(headers, "authorization");
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    return false;
  }
  const candidate = authorization.slice("Bearer ".length);
  for (const [credential, expiresAt] of credentials) {
    if (expiresAt > now && tokensEqual(candidate, credential)) {
      return true;
    }
  }
  return false;
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
