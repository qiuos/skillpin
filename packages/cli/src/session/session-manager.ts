import type { IncomingHttpHeaders } from "node:http";

import {
  type LocalSessionInfo,
  type SessionState,
  transitionSession,
} from "@skillpin/core";
import { ProjectChangeService } from "@skillpin/core/changes";
import {
  fingerprintTargetPath,
  NodePlatformLinkAdapter,
  normalizeDirectoryTarget,
} from "@skillpin/core/platform";
import { ProjectLock, ProjectSnapshotService } from "@skillpin/core/project";

import { CliError } from "../command/cli-error.js";
import { hasValidCredential } from "../security/request-guard.js";
import {
  BOOTSTRAP_TOKEN_TTL_MS,
  createToken,
  hasExpired,
  SESSION_CREDENTIAL_TTL_MS,
  tokensEqual,
  type ExpiringToken,
} from "../security/session-token.js";
import { LocalHttpServer } from "../server/http-server.js";
import { createCatalogRoutes } from "../server/routes/catalog-routes.js";
import { createSourceRoutes } from "../server/routes/source-routes.js";
import { SessionRegistry } from "./session-registry.js";
import { SourceRuntime } from "./source-runtime.js";
import {
  DEFAULT_EXIT_GRACE_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
} from "./session-lifecycle.js";

export type SessionCloseReason = "api" | "explicit" | "signal" | "timeout";

export interface LocalSessionRuntime {
  readonly projectDirectory: string;
  readonly projectFingerprint: string;
  readonly sessionId: string;
  readonly sourceRuntime: SourceRuntime;
  close(reason: SessionCloseReason): Promise<void>;
  consumeBootstrapToken(token: string): ExpiringToken | null;
  hasValidCredential(headers: IncomingHttpHeaders): boolean;
  hasValidWebSocketCredential(credential: string): boolean;
  issueBootstrapToken(): string;
  runProjectOperation<T>(operation: () => Promise<T>): Promise<T>;
  sessionInfo(): LocalSessionInfo;
  setClientCount(count: number): void;
}

export interface ProjectServices {
  readonly changeService: ProjectChangeService;
  readonly snapshotService: ProjectSnapshotService;
}

export interface ManagedSessionOptions {
  readonly exitGraceMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly heartbeatTimeoutMs?: number;
  readonly onClosed: (session: ManagedSession) => void;
  readonly port?: number;
  readonly projectDirectory: string;
  readonly projectFingerprint: string;
  readonly userConfigPath?: string;
}

/** A fixed-target session with all secrets held only in this process's memory. */
export class ManagedSession implements LocalSessionRuntime {
  readonly #bootstrapTokens = new Map<string, ExpiringToken>();
  readonly #credentials = new Map<string, number>();
  readonly #exitGraceMs: number;
  readonly #heartbeatIntervalMs: number;
  readonly #heartbeatTimeoutMs: number;
  readonly #onClosed: (session: ManagedSession) => void;
  readonly #port: number;
  readonly #server: LocalHttpServer;
  readonly #stateBase: Omit<SessionState, "status">;
  readonly projectServices: ProjectServices;
  public readonly sourceRuntime: SourceRuntime;
  #activeOperations = 0;
  #clientCount = 0;
  #closePromise: Promise<void> | null = null;
  readonly #closedListeners = new Set<() => void>();
  #drainWaiters: (() => void)[] = [];
  #state: SessionState;
  #waitingToExitAt: number | null = null;
  #waitingToExitTimer: NodeJS.Timeout | null = null;

  public readonly projectDirectory: string;
  public readonly projectFingerprint: string;
  public readonly sessionId: string;

  public constructor(options: ManagedSessionOptions) {
    this.projectDirectory = options.projectDirectory;
    this.projectFingerprint = options.projectFingerprint;
    this.sessionId = createToken();
    this.#stateBase = {
      projectFingerprint: options.projectFingerprint,
      sessionId: this.sessionId,
    };
    this.#state = { ...this.#stateBase, status: "starting" };
    this.#exitGraceMs = options.exitGraceMs ?? DEFAULT_EXIT_GRACE_MS;
    this.#heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.#heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.#onClosed = options.onClosed;
    this.#port = options.port ?? 0;

    this.sourceRuntime = new SourceRuntime({
      ...(options.userConfigPath === undefined
        ? {}
        : { configFilePath: options.userConfigPath }),
      inspectProject: async () =>
        this.projectServices.snapshotService.inspect(),
    });

    const adapter = new NodePlatformLinkAdapter();
    const snapshotService = new ProjectSnapshotService({
      adapter,
      projectDirectory: this.projectDirectory,
      sources: () => this.sourceRuntime.sourceHealth(),
    });
    this.projectServices = {
      changeService: new ProjectChangeService({
        adapter,
        lock: new ProjectLock(),
        snapshotService,
      }),
      snapshotService,
    };
    this.#server = new LocalHttpServer({
      heartbeatIntervalMs: this.#heartbeatIntervalMs,
      additionalRoutes: [...createSourceRoutes(), ...createCatalogRoutes()],
      heartbeatTimeoutMs: this.#heartbeatTimeoutMs,
      session: this,
    });
  }

  public get address(): string {
    return this.#server.origin;
  }

  public get clientCount(): number {
    return this.#clientCount;
  }

  public get status(): SessionState["status"] {
    return this.#state.status;
  }

  public onClosed(listener: () => void): () => void {
    this.#closedListeners.add(listener);
    return () => this.#closedListeners.delete(listener);
  }

  public async start(): Promise<void> {
    try {
      await this.sourceRuntime.initialize();
      const inspection = await this.projectServices.snapshotService.inspect();
      if (!inspection.ok) {
        throw new CliError(
          "The target project has an unsupported SkillPin directory state.",
          "CLI_TARGET_UNSUPPORTED",
        );
      }
      await this.#server.listen(this.#port);
      this.#state = transitionSession(this.#state, "running");
    } catch (error: unknown) {
      await this.#server.close();
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      if (code === "EADDRINUSE") {
        throw new CliError(
          "The requested loopback port is already in use.",
          "CLI_PORT_UNAVAILABLE",
        );
      }
      throw error;
    }
  }

  public issueBootstrapToken(): string {
    this.cleanExpiredTokens();
    const token = createToken();
    this.#bootstrapTokens.set(token, {
      expiresAt: Date.now() + BOOTSTRAP_TOKEN_TTL_MS,
      value: token,
    });
    return token;
  }

  public consumeBootstrapToken(token: string): ExpiringToken | null {
    this.cleanExpiredTokens();
    for (const [stored, entry] of this.#bootstrapTokens) {
      if (tokensEqual(token, stored)) {
        this.#bootstrapTokens.delete(stored);
        if (hasExpired(entry, Date.now())) {
          return null;
        }
        const credential = createToken();
        const expiresAt = Date.now() + SESSION_CREDENTIAL_TTL_MS;
        this.#credentials.set(credential, expiresAt);
        return { expiresAt, value: credential };
      }
    }
    return null;
  }

  public hasValidCredential(headers: IncomingHttpHeaders): boolean {
    this.cleanExpiredTokens();
    return hasValidCredential(headers, this.#credentials, Date.now());
  }

  public hasValidWebSocketCredential(credential: string): boolean {
    this.cleanExpiredTokens();
    for (const [stored, expiresAt] of this.#credentials) {
      if (expiresAt > Date.now() && tokensEqual(credential, stored)) {
        return true;
      }
    }
    return false;
  }

  public sessionInfo(): LocalSessionInfo {
    return {
      clientCount: this.#clientCount,
      projectDirectory: this.projectDirectory,
      projectFingerprint: this.projectFingerprint,
      sessionId: this.sessionId,
      status: this.#state.status,
      waitingToExitAt:
        this.#waitingToExitAt === null
          ? null
          : new Date(this.#waitingToExitAt).toISOString(),
    };
  }

  public setClientCount(count: number): void {
    this.#clientCount = count;
    if (count > 0 && this.#state.status === "waiting-to-exit") {
      this.clearExitTimer();
      this.#state = transitionSession(this.#state, "running");
      this.#server.broadcast("session.running", { clientCount: count });
      return;
    }
    if (count === 0 && this.#state.status === "running") {
      this.#state = transitionSession(this.#state, "waiting-to-exit");
      this.#waitingToExitAt = Date.now() + this.#exitGraceMs;
      this.#waitingToExitTimer = setTimeout(() => {
        void this.close("timeout");
      }, this.#exitGraceMs);
      this.#waitingToExitTimer.unref();
      this.#server.broadcast("session.waiting-to-exit", {
        clientCount: 0,
      });
    }
  }

  /** P6–P9 routes must use this around ProjectChangeService.apply. */
  public async runProjectOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closePromise !== null || this.#state.status === "exiting") {
      throw new CliError(
        "The SkillPin session is closing and cannot start a project operation.",
        "CLI_TARGET_UNSUPPORTED",
      );
    }
    this.#activeOperations += 1;
    try {
      return await operation();
    } finally {
      this.#activeOperations -= 1;
      if (this.#activeOperations === 0) {
        for (const resolve of this.#drainWaiters.splice(0)) {
          resolve();
        }
      }
    }
  }

  public async close(_reason: SessionCloseReason): Promise<void> {
    void _reason;
    if (this.#closePromise !== null) {
      return this.#closePromise;
    }
    this.clearExitTimer();
    this.#state = transitionSession(this.#state, "exiting");
    this.#server.stopAccepting();
    this.#closePromise = (async () => {
      await this.waitForProjectOperations();
      await this.#server.close();
      this.#bootstrapTokens.clear();
      this.#credentials.clear();
      this.#onClosed(this);
      for (const listener of this.#closedListeners) {
        listener();
      }
      this.#closedListeners.clear();
    })();
    return this.#closePromise;
  }

  private cleanExpiredTokens(): void {
    const now = Date.now();
    for (const [token, entry] of this.#bootstrapTokens) {
      if (hasExpired(entry, now)) {
        this.#bootstrapTokens.delete(token);
      }
    }
    for (const [credential, expiresAt] of this.#credentials) {
      if (expiresAt <= now) {
        this.#credentials.delete(credential);
      }
    }
  }

  private clearExitTimer(): void {
    if (this.#waitingToExitTimer !== null) {
      clearTimeout(this.#waitingToExitTimer);
      this.#waitingToExitTimer = null;
    }
    this.#waitingToExitAt = null;
  }

  private async waitForProjectOperations(): Promise<void> {
    if (this.#activeOperations === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.#drainWaiters.push(resolve);
    });
  }
}

export interface StartSessionInput {
  readonly exitGraceMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly heartbeatTimeoutMs?: number;
  readonly port?: number;
  readonly target: string;
  readonly userConfigPath?: string;
}

export interface StartedSession {
  readonly reused: boolean;
  readonly session: ManagedSession;
}

/** Normalizes target paths before the process-local registry can associate a session. */
export class SessionManager {
  readonly #registry: SessionRegistry;

  public constructor(registry = new SessionRegistry()) {
    this.#registry = registry;
  }

  public get registrySize(): number {
    return this.#registry.size;
  }

  public async start(input: StartSessionInput): Promise<StartedSession> {
    const normalized = await normalizeDirectoryTarget(input.target);
    if (!normalized.ok) {
      throw new CliError(
        "The target must be an existing project directory.",
        "CLI_TARGET_INVALID",
      );
    }
    const projectDirectory = normalized.value;
    const projectFingerprint = fingerprintTargetPath(projectDirectory);
    const result = await this.#registry.acquire(
      projectFingerprint,
      async () => {
        const session = new ManagedSession({
          ...(input.exitGraceMs === undefined
            ? {}
            : { exitGraceMs: input.exitGraceMs }),
          ...(input.heartbeatIntervalMs === undefined
            ? {}
            : { heartbeatIntervalMs: input.heartbeatIntervalMs }),
          ...(input.heartbeatTimeoutMs === undefined
            ? {}
            : { heartbeatTimeoutMs: input.heartbeatTimeoutMs }),
          ...(input.port === undefined ? {} : { port: input.port }),
          ...(input.userConfigPath === undefined
            ? {}
            : { userConfigPath: input.userConfigPath }),
          onClosed: (closedSession) => this.#registry.remove(closedSession),
          projectDirectory,
          projectFingerprint,
        });
        await session.start();
        return session;
      },
    );
    return result;
  }
}
