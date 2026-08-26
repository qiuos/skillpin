import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";

import { readStaticAsset } from "./static-assets.js";

import { LOCAL_API_VERSION, type LocalApiError } from "@skillpin/core";

import {
  guardLocalRequest,
  hasWebSocketProtocol,
  readCookie,
  readWebSocketCredential,
} from "../security/request-guard.js";
import {
  createWebSocketAccept,
  WebSocketEventHub,
} from "./websocket-events.js";
import {
  bootstrapResponse,
  createSessionRoutes,
} from "./routes/session-routes.js";
import type { LocalApiRoute } from "./routes/types.js";
import type { LocalSessionRuntime } from "../session/session-manager.js";

const BOOTSTRAP_COOKIE = "skillpin_bootstrap";

export interface LocalHttpServerOptions {
  readonly additionalRoutes?: readonly LocalApiRoute[];
  readonly heartbeatIntervalMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly session: LocalSessionRuntime;
  readonly staticDirectory?: string;
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function writeError(
  response: ServerResponse,
  status: number,
  error: LocalApiError,
): void {
  writeJson(response, status, { error, version: LOCAL_API_VERSION });
}

function requestRejection(): LocalApiError {
  return {
    code: "LOCAL_REQUEST_REJECTED",
    message: "This request is not allowed for the current local session.",
    recoveryAction: "open-session",
    retryable: false,
  };
}

function unauthorized(): LocalApiError {
  return {
    code: "SESSION_CREDENTIAL_INVALID",
    message: "A valid SkillPin session credential is required.",
    recoveryAction: "open-session",
    retryable: false,
  };
}

function notFound(): LocalApiError {
  return {
    code: "API_NOT_FOUND",
    message: "The requested local API route does not exist.",
    recoveryAction: "review-state",
    retryable: false,
  };
}

function methodNotAllowed(): LocalApiError {
  return {
    code: "API_METHOD_NOT_ALLOWED",
    message:
      "The requested HTTP method is not allowed for this local API route.",
    recoveryAction: "review-state",
    retryable: false,
  };
}

function closing(): LocalApiError {
  return {
    code: "SESSION_CLOSING",
    message: "The SkillPin session is closing and cannot accept new requests.",
    recoveryAction: "retry",
    retryable: true,
  };
}

function staticPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SkillPin</title><style>body{font-family:system-ui,sans-serif;margin:3rem;color:#111827}#status{color:#4b5563}</style></head><body><main><h1>SkillPin</h1><p id="status">Connecting to the protected local session…</p></main><script type="module">fetch("/api/session/bootstrap",{method:"POST",credentials:"same-origin"}).then(async(r)=>{const b=await r.json();if(!r.ok)throw new Error(b.error?.message??"Unable to start session");window.skillpinSession=b.data;document.querySelector("#status").textContent="Session ready. The SkillPin web interface will load here."}).catch(()=>{document.querySelector("#status").textContent="Unable to connect to this local session."});</script></body></html>`;
}

function favicon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#4f46e5"/><path d="M18 19h28v8H18zm0 18h20v8H18z" fill="white"/></svg>`;
}

/** Loopback-only HTTP and WebSocket transport. Route code never bypasses its guards. */
export class LocalHttpServer {
  readonly #additionalRoutes: readonly LocalApiRoute[];
  readonly #session: LocalSessionRuntime;
  readonly #staticDirectory: string | undefined;
  readonly #server = createServer((request, response) => {
    void this.handleRequest(request, response);
  });
  readonly #webSocketHub: WebSocketEventHub;
  #accepting = true;
  #port: number | null = null;

  public constructor(options: LocalHttpServerOptions) {
    this.#additionalRoutes = options.additionalRoutes ?? [];
    this.#session = options.session;
    this.#staticDirectory = options.staticDirectory;
    this.#webSocketHub = new WebSocketEventHub({
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs,
      onClientCountChanged: (count) => this.#session.setClientCount(count),
      sessionId: options.session.sessionId,
    });
    this.#server.on("upgrade", (request, socket) => {
      this.handleUpgrade(request, socket);
    });
  }

  public get clientCount(): number {
    return this.#webSocketHub.clientCount;
  }

  public get port(): number {
    if (this.#port === null) {
      throw new Error("The local server has not started.");
    }
    return this.#port;
  }

  public get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  public async listen(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.#server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.#server.off("error", onError);
        resolve();
      };
      this.#server.once("error", onError);
      this.#server.once("listening", onListening);
      this.#server.listen({ host: "127.0.0.1", port });
    });
    const address = this.#server.address();
    if (address === null || typeof address === "string") {
      throw new Error("The local server did not expose a TCP address.");
    }
    if (address.address !== "127.0.0.1") {
      throw new Error(
        "The local server did not bind to the IPv4 loopback address.",
      );
    }
    this.#port = address.port;
  }

  public stopAccepting(): void {
    this.#accepting = false;
  }

  public broadcast(
    type: string,
    data: Record<string, boolean | number | string | null>,
  ): void {
    this.#webSocketHub.broadcast(type, data);
  }

  public async close(): Promise<void> {
    this.#accepting = false;
    this.#webSocketHub.close();
    await new Promise<void>((resolve) => {
      this.#server.close((error) => {
        if (
          error !== undefined &&
          (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
        ) {
          resolve();
          return;
        }
        resolve();
      });
      this.#server.closeAllConnections();
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (this.#port === null) {
      response.destroy();
      return;
    }
    const requestTarget = request.url ?? "/";
    const url = new URL(requestTarget, this.origin);
    const rawPath = requestTarget.split("?", 1)[0] ?? requestTarget;
    if (
      url.pathname === "/" ||
      url.pathname === "/favicon.svg" ||
      rawPath.startsWith("/assets/")
    ) {
      await this.handleStaticRequest(request, response, url.pathname);
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      response.writeHead(404, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    const guard = guardLocalRequest(
      request.headers,
      request.socket,
      {
        origin: this.origin,
        port: this.port,
      },
      true,
    );
    if (guard !== null) {
      writeError(response, 403, requestRejection());
      return;
    }
    if (!this.#accepting) {
      writeError(response, 503, closing());
      return;
    }
    if (url.pathname === "/api/session/bootstrap") {
      this.handleBootstrap(request, response);
      return;
    }
    if (!this.#session.hasValidCredential(request.headers)) {
      writeError(response, 401, unauthorized());
      return;
    }
    const routes = [...createSessionRoutes(), ...this.#additionalRoutes];
    const matchingRoutes = routes.filter((candidate) =>
      typeof candidate.path === "string"
        ? candidate.path === url.pathname
        : candidate.path.test(url.pathname),
    );
    const route = matchingRoutes.find(
      (candidate) => candidate.method === request.method,
    );
    if (route === undefined) {
      writeError(
        response,
        matchingRoutes.length === 0 ? 404 : 405,
        matchingRoutes.length === 0 ? notFound() : methodNotAllowed(),
      );
      return;
    }
    try {
      await route.handle(request, response, this.#session);
    } catch {
      writeError(response, 500, {
        code: "LOCAL_API_FAILED",
        message: "The local API request could not be completed.",
        recoveryAction: "retry",
        retryable: true,
      });
    }
  }

  private async handleStaticRequest(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    const guard = guardLocalRequest(
      request.headers,
      request.socket,
      {
        origin: this.origin,
        port: this.port,
      },
      false,
    );
    if (guard !== null || !this.#accepting) {
      response.writeHead(403, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    const asset =
      this.#staticDirectory === undefined
        ? null
        : await readStaticAsset(this.#staticDirectory, request.url ?? pathname);
    if (asset !== null) {
      const headers: Record<string, string> = {
        "Cache-Control": "no-store",
        "Content-Type": asset.contentType,
        "X-Content-Type-Options": "nosniff",
      };
      if (pathname === "/") {
        const bootstrap = this.#session.issueBootstrapToken();
        headers["Set-Cookie"] =
          `${BOOTSTRAP_COOKIE}=${bootstrap}; HttpOnly; Path=/; SameSite=Strict; Max-Age=300`;
      }
      response.writeHead(200, headers);
      response.end(request.method === "HEAD" ? undefined : asset.body);
      return;
    }
    if (pathname === "/favicon.svg") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "image/svg+xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : favicon());
      return;
    }
    if (pathname === "/" && this.#staticDirectory === undefined) {
      const bootstrap = this.#session.issueBootstrapToken();
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": `${BOOTSTRAP_COOKIE}=${bootstrap}; HttpOnly; Path=/; SameSite=Strict; Max-Age=300`,
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : staticPage());
      return;
    }
    response.writeHead(404, {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end();
  }

  private handleBootstrap(
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    if (request.method !== "POST") {
      writeError(response, 405, methodNotAllowed());
      return;
    }
    const bootstrap = readCookie(request.headers, BOOTSTRAP_COOKIE);
    const credential =
      bootstrap === undefined
        ? null
        : this.#session.consumeBootstrapToken(bootstrap);
    if (credential === null) {
      writeError(response, 401, unauthorized());
      return;
    }
    writeJson(
      response,
      200,
      {
        data: bootstrapResponse(
          this.#session.sessionInfo(),
          credential.value,
          new Date(credential.expiresAt),
        ),
        version: LOCAL_API_VERSION,
      },
      {
        "Set-Cookie": `${BOOTSTRAP_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`,
      },
    );
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex): void {
    if (this.#port === null || !this.#accepting) {
      socket.destroy();
      return;
    }
    const url = new URL(request.url ?? "/", this.origin);
    const guard = guardLocalRequest(
      request.headers,
      socket as typeof socket & { readonly remoteAddress?: string },
      {
        origin: this.origin,
        port: this.port,
      },
      true,
    );
    const credential = readWebSocketCredential(request.headers);
    const validUpgrade =
      url.pathname === "/api/session/events" &&
      request.headers.upgrade?.toLowerCase() === "websocket" &&
      request.headers["sec-websocket-version"] === "13" &&
      typeof request.headers["sec-websocket-key"] === "string" &&
      hasWebSocketProtocol(request.headers, "skillpin.v1") &&
      guard === null &&
      credential !== undefined &&
      this.#session.hasValidWebSocketCredential(credential);
    if (!validUpgrade) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
        "Sec-WebSocket-Protocol: skillpin.v1",
        "\r\n",
      ].join("\r\n"),
    );
    this.#webSocketHub.accept(socket);
  }
}
