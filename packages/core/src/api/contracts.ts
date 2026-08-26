/** Wire-contract version for the loopback API shared by the CLI server and Web client. */
export const LOCAL_API_VERSION = 1 as const;

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type LocalSessionStatus =
  "exiting" | "running" | "starting" | "waiting-to-exit";

/** Session data safe to expose to the page after it authenticates. */
export interface LocalSessionInfo {
  readonly clientCount: number;
  readonly projectDirectory: string;
  readonly projectFingerprint: string;
  readonly sessionId: string;
  readonly status: LocalSessionStatus;
  readonly waitingToExitAt: string | null;
}

export interface BootstrapSessionResponse {
  readonly credential: string;
  readonly credentialExpiresAt: string;
  readonly session: LocalSessionInfo;
}

export interface LocalApiSuccess<T> {
  readonly data: T;
  readonly version: typeof LOCAL_API_VERSION;
}

export interface LocalApiError {
  readonly code: string;
  readonly message: string;
  readonly recoveryAction: "open-session" | "retry" | "review-state";
  readonly retryable: boolean;
}

export interface LocalApiFailure {
  readonly error: LocalApiError;
  readonly version: typeof LOCAL_API_VERSION;
}

export type LocalApiResponse<T> = LocalApiFailure | LocalApiSuccess<T>;

/** Ordered state/change notification delivered to authenticated WebSocket pages. */
export interface LocalSessionEvent {
  readonly data: JsonObject;
  readonly sequence: number;
  readonly sessionId: string;
  readonly type: string;
  readonly version: typeof LOCAL_API_VERSION;
}
