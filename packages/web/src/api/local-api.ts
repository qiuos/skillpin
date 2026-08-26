import {
  LOCAL_API_VERSION,
  type BootstrapSessionResponse,
  type LocalApiError,
  type LocalApiResponse,
  type LocalSessionEvent,
  type LocalSessionInfo,
} from "@skillpin/core";

export class LocalApiClientError extends Error {
  public readonly code: string;
  public readonly recoveryAction: LocalApiError["recoveryAction"];
  public readonly retryable: boolean;

  public constructor(error: LocalApiError) {
    super(error.message);
    this.name = "LocalApiClientError";
    this.code = error.code;
    this.recoveryAction = error.recoveryAction;
    this.retryable = error.retryable;
  }
}

export interface LocalApiClientOptions {
  readonly fetchImpl?: typeof fetch;
}

function invalidResponse(): LocalApiClientError {
  return new LocalApiClientError({
    code: "LOCAL_API_INVALID_RESPONSE",
    message: "The local SkillPin service returned an invalid response.",
    recoveryAction: "retry",
    retryable: true,
  });
}

function isApiResponse<T>(value: unknown): value is LocalApiResponse<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    (value as { version?: unknown }).version === LOCAL_API_VERSION &&
    ("data" in value || "error" in value)
  );
}

function isLocalApiError(value: unknown): value is LocalApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string" &&
    typeof (value as { retryable?: unknown }).retryable === "boolean" &&
    ["open-session", "retry", "review-state"].includes(
      String((value as { recoveryAction?: unknown }).recoveryAction),
    )
  );
}

function isSessionInfo(value: unknown): value is LocalSessionInfo {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const session = value as Record<string, unknown>;
  return (
    typeof session.clientCount === "number" &&
    typeof session.projectDirectory === "string" &&
    typeof session.projectFingerprint === "string" &&
    typeof session.sessionId === "string" &&
    ["exiting", "running", "starting", "waiting-to-exit"].includes(
      String(session.status),
    ) &&
    (typeof session.waitingToExitAt === "string" ||
      session.waitingToExitAt === null)
  );
}

function isBootstrapResponse(
  value: unknown,
): value is BootstrapSessionResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const response = value as Record<string, unknown>;
  return (
    typeof response.credential === "string" &&
    typeof response.credentialExpiresAt === "string" &&
    isSessionInfo(response.session)
  );
}

export class LocalApiClient {
  readonly #fetch: typeof fetch;
  #credential: string | null = null;

  public constructor(options: LocalApiClientOptions = {}) {
    this.#fetch = options.fetchImpl ?? fetch;
  }

  public async bootstrap(): Promise<BootstrapSessionResponse> {
    const response = await this.#request<BootstrapSessionResponse>(
      "/api/session/bootstrap",
      { credentials: "same-origin", method: "POST" },
      false,
    );
    if (!isBootstrapResponse(response)) {
      throw invalidResponse();
    }
    this.#credential = response.credential;
    return response;
  }

  public async session(): Promise<LocalSessionInfo> {
    const response = await this.#request<LocalSessionInfo>("/api/session", {
      method: "GET",
    });
    if (!isSessionInfo(response)) {
      throw invalidResponse();
    }
    return response;
  }

  public async shutdown(): Promise<void> {
    await this.#request<{ status: string }>("/api/session/shutdown", {
      method: "POST",
    });
  }

  public webSocketProtocols(): string[] {
    if (this.#credential === null) {
      throw new LocalApiClientError({
        code: "SESSION_CREDENTIAL_MISSING",
        message: "The local SkillPin session is not ready yet.",
        recoveryAction: "open-session",
        retryable: false,
      });
    }
    return ["skillpin.v1", `skillpin.credential.${this.#credential}`];
  }

  async #request<T>(
    path: string,
    init: RequestInit,
    authenticated = true,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (authenticated) {
      if (this.#credential === null) {
        throw new LocalApiClientError({
          code: "SESSION_CREDENTIAL_MISSING",
          message: "The local SkillPin session is not ready yet.",
          recoveryAction: "open-session",
          retryable: false,
        });
      }
      headers.set("Authorization", `Bearer ${this.#credential}`);
    }

    let response: Response;
    try {
      response = await this.#fetch(path, { ...init, headers });
    } catch {
      throw new LocalApiClientError({
        code: "LOCAL_API_UNREACHABLE",
        message: "Unable to reach the local SkillPin service.",
        recoveryAction: "retry",
        retryable: true,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw invalidResponse();
    }
    if (!isApiResponse<T>(body)) {
      throw invalidResponse();
    }
    if ("error" in body) {
      if (!isLocalApiError(body.error)) {
        throw invalidResponse();
      }
      throw new LocalApiClientError(body.error);
    }
    if (!response.ok) {
      throw invalidResponse();
    }
    return body.data;
  }
}

export function localEventFromMessage(
  message: unknown,
): LocalSessionEvent | null {
  if (typeof message !== "string") {
    return null;
  }
  try {
    const event: unknown = JSON.parse(message);
    if (typeof event !== "object" || event === null) {
      return null;
    }
    const value = event as Record<string, unknown>;
    if (
      value.version !== LOCAL_API_VERSION ||
      typeof value.type !== "string" ||
      typeof value.sessionId !== "string" ||
      typeof value.sequence !== "number" ||
      typeof value.data !== "object" ||
      value.data === null ||
      Array.isArray(value.data)
    ) {
      return null;
    }
    return value as unknown as LocalSessionEvent;
  } catch {
    return null;
  }
}
