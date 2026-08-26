import {
  LOCAL_API_VERSION,
  type BootstrapSessionResponse,
  type LocalApiError,
  type LocalApiResponse,
  type LocalCatalogCandidate,
  type LocalCatalogCandidateDetail,
  type LocalCatalogResponse,
  type LocalDirectoryBrowserEntrypoint,
  type LocalDirectoryListing,
  type LocalSessionEvent,
  type LocalSessionInfo,
  type LocalSourceInput,
  type LocalSourceListResponse,
  type LocalSourcePathValidation,
  type LocalSourceRemoveResult,
  type LocalSourceSummary,
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

function isLocalSource(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const source = value as Record<string, unknown>;
  return (
    typeof source.id === "string" &&
    typeof source.displayName === "string" &&
    typeof source.path === "string" &&
    typeof source.enabled === "boolean"
  );
}

function isSourceSummary(value: unknown): value is LocalSourceSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const summary = value as Record<string, unknown>;
  const scan = summary.scan;
  return (
    isLocalSource(summary.source) &&
    summary.failure !== undefined &&
    (summary.failure === null || isLocalApiError(summary.failure)) &&
    [
      "disabled",
      "failed",
      "healthy",
      "no-skills",
      "unscanned",
      "warnings",
    ].includes(String(summary.health)) &&
    (scan === null ||
      (typeof scan === "object" &&
        scan !== null &&
        typeof (scan as Record<string, unknown>).skillCount === "number" &&
        Array.isArray((scan as Record<string, unknown>).warnings)))
  );
}

function isSourceListResponse(
  value: unknown,
): value is LocalSourceListResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).sources) &&
    (value as { sources: unknown[] }).sources.every(isSourceSummary)
  );
}

function isCatalogCandidate(value: unknown): value is LocalCatalogCandidate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const warning = candidate.parseWarning;
  return (
    (typeof candidate.contentFingerprint === "string" ||
      candidate.contentFingerprint === null) &&
    typeof candidate.displayName === "string" &&
    typeof candidate.id === "string" &&
    typeof candidate.linkName === "string" &&
    typeof candidate.relativePath === "string" &&
    typeof candidate.summary === "string" &&
    isLocalSource(candidate.source) &&
    (warning === null ||
      (typeof warning === "object" &&
        warning !== null &&
        typeof (warning as Record<string, unknown>).code === "string" &&
        typeof (warning as Record<string, unknown>).message === "string"))
  );
}

function isCatalogResponse(value: unknown): value is LocalCatalogResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    typeof response.query === "string" &&
    Array.isArray(response.groups) &&
    response.groups.every((group) => {
      if (typeof group !== "object" || group === null) return false;
      const record = group as Record<string, unknown>;
      return (
        typeof record.conflictKey === "string" &&
        typeof record.linkName === "string" &&
        Array.isArray(record.matchingCandidateIds) &&
        record.matchingCandidateIds.every((id) => typeof id === "string") &&
        Array.isArray(record.candidates) &&
        record.candidates.every(isCatalogCandidate)
      );
    })
  );
}

function isCatalogCandidateDetail(
  value: unknown,
): value is LocalCatalogCandidateDetail {
  return (
    isCatalogCandidate(value) &&
    typeof (value as unknown as Record<string, unknown>).markdownBody ===
      "string" &&
    typeof (value as unknown as Record<string, unknown>).skillDirectory ===
      "string" &&
    typeof (value as unknown as Record<string, unknown>).skillFilePath ===
      "string"
  );
}

function isPathValidation(value: unknown): value is LocalSourcePathValidation {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).path === "string"
  );
}

function isDirectoryListing(value: unknown): value is LocalDirectoryListing {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const listing = value as Record<string, unknown>;
  return (
    typeof listing.directoryPath === "string" &&
    Array.isArray(listing.entries) &&
    listing.entries.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).name === "string" &&
        typeof (entry as Record<string, unknown>).path === "string" &&
        typeof (entry as Record<string, unknown>).realPath === "string",
    )
  );
}

function isEntrypoints(value: unknown): value is {
  readonly entries: readonly LocalDirectoryBrowserEntrypoint[];
} {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).entries) &&
    (value as { entries: unknown[] }).entries.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        ["home", "recent", "root"].includes(
          String((entry as Record<string, unknown>).kind),
        ) &&
        typeof (entry as Record<string, unknown>).label === "string" &&
        typeof (entry as Record<string, unknown>).path === "string",
    )
  );
}

function isSourceRemoveResult(
  value: unknown,
): value is LocalSourceRemoveResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const result = value as Record<string, unknown>;
  if (result.kind === "removed") {
    return isLocalSource(result.source);
  }
  if (result.kind === "impact") {
    const impact = result.impact;
    return (
      typeof impact === "object" &&
      impact !== null &&
      typeof (impact as Record<string, unknown>).sourceId === "string" &&
      typeof (impact as Record<string, unknown>).managedLinkCount === "number"
    );
  }
  return false;
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
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
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

  public async catalog(query = ""): Promise<LocalCatalogResponse> {
    const response = await this.#request<LocalCatalogResponse>(
      `/api/catalog?query=${encodeURIComponent(query)}`,
      { method: "GET" },
    );
    if (!isCatalogResponse(response)) throw invalidResponse();
    return response;
  }

  public async catalogCandidate(
    candidateId: string,
  ): Promise<LocalCatalogCandidateDetail> {
    const response = await this.#request<LocalCatalogCandidateDetail>(
      `/api/catalog/candidates/${encodeURIComponent(candidateId)}`,
      { method: "GET" },
    );
    if (!isCatalogCandidateDetail(response)) throw invalidResponse();
    return response;
  }

  public async sources(): Promise<LocalSourceListResponse> {
    const response = await this.#request<LocalSourceListResponse>(
      "/api/sources",
      { method: "GET" },
    );
    if (!isSourceListResponse(response)) {
      throw invalidResponse();
    }
    return response;
  }

  public async addSource(input: LocalSourceInput): Promise<LocalSourceSummary> {
    const response = await this.#request<LocalSourceSummary>("/api/sources", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!isSourceSummary(response)) {
      throw invalidResponse();
    }
    return response;
  }

  public async updateSource(
    sourceId: string,
    input: LocalSourceInput,
  ): Promise<LocalSourceSummary> {
    const response = await this.#request<LocalSourceSummary>(
      `/api/sources/${encodeURIComponent(sourceId)}`,
      {
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );
    if (!isSourceSummary(response)) {
      throw invalidResponse();
    }
    return response;
  }

  public async rescanSource(sourceId: string): Promise<LocalSourceSummary> {
    const response = await this.#request<LocalSourceSummary>(
      `/api/sources/${encodeURIComponent(sourceId)}/scan`,
      { method: "POST" },
    );
    if (!isSourceSummary(response)) {
      throw invalidResponse();
    }
    return response;
  }

  public async removeSource(
    sourceId: string,
    confirmProjectImpact = false,
  ): Promise<LocalSourceRemoveResult> {
    const response = await this.#request<LocalSourceRemoveResult>(
      `/api/sources/${encodeURIComponent(sourceId)}`,
      {
        body: JSON.stringify({ confirmProjectImpact }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      },
    );
    if (!isSourceRemoveResult(response)) {
      throw invalidResponse();
    }
    return response;
  }

  public async validateSourcePath(
    sourcePath: string,
  ): Promise<LocalSourcePathValidation> {
    const response = await this.#request<LocalSourcePathValidation>(
      "/api/sources/validate",
      {
        body: JSON.stringify({ path: sourcePath }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!isPathValidation(response)) {
      throw invalidResponse();
    }
    return response;
  }

  public async directoryEntrypoints(): Promise<
    readonly LocalDirectoryBrowserEntrypoint[]
  > {
    const response = await this.#request<{
      readonly entries: readonly LocalDirectoryBrowserEntrypoint[];
    }>("/api/directories/entrypoints", { method: "GET" });
    if (!isEntrypoints(response)) {
      throw invalidResponse();
    }
    return response.entries;
  }

  public async directories(
    directoryPath: string,
  ): Promise<LocalDirectoryListing> {
    const response = await this.#request<LocalDirectoryListing>(
      `/api/directories?path=${encodeURIComponent(directoryPath)}`,
      { method: "GET" },
    );
    if (!isDirectoryListing(response)) {
      throw invalidResponse();
    }
    return response;
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
