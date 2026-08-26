import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  LocalApiClient,
  LocalApiClientError,
  localEventFromMessage,
} from "../../api/local-api.js";
import type { LocalSessionEvent, LocalSessionInfo } from "@skillpin/core";

export type SessionConnectionState =
  | "connecting"
  | "disconnected"
  | "error"
  | "exiting"
  | "online"
  | "reconnecting";

interface SessionContextValue {
  readonly connection: SessionConnectionState;
  readonly error: LocalApiClientError | null;
  readonly isReadOnly: boolean;
  readonly session: LocalSessionInfo | null;
  readonly shutdown: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const client = new LocalApiClient();
let bootstrap: Promise<LocalSessionInfo> | null = null;

function bootstrapSession(): Promise<LocalSessionInfo> {
  bootstrap ??= client.bootstrap().then((response) => response.session);
  return bootstrap;
}

function websocketUrl(): string {
  const url = new URL("/api/session/events", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function sessionAfterEvent(
  session: LocalSessionInfo,
  event: LocalSessionEvent,
): LocalSessionInfo {
  if (event.type === "session.client-count") {
    const count = event.data.clientCount;
    return typeof count === "number"
      ? { ...session, clientCount: count }
      : session;
  }
  if (event.type === "session.waiting-to-exit") {
    const waitingToExitAt = event.data.waitingToExitAt;
    return {
      ...session,
      status: "waiting-to-exit",
      waitingToExitAt:
        typeof waitingToExitAt === "string" ? waitingToExitAt : null,
    };
  }
  if (event.type === "session.running") {
    return { ...session, status: "running", waitingToExitAt: null };
  }
  return session;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [connection, setConnection] =
    useState<SessionConnectionState>("connecting");
  const [error, setError] = useState<LocalApiClientError | null>(null);
  const [session, setSession] = useState<LocalSessionInfo | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const intentionalClose = useRef(false);
  const attempts = useRef(0);

  const closeSocket = useCallback(() => {
    if (reconnectTimer.current !== null) {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    socket.current?.close();
    socket.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled || intentionalClose.current) {
        return;
      }
      let nextSocket: WebSocket;
      try {
        nextSocket = new WebSocket(websocketUrl(), client.webSocketProtocols());
      } catch {
        setConnection("error");
        return;
      }
      socket.current = nextSocket;
      nextSocket.addEventListener("open", () => {
        attempts.current = 0;
        setConnection("online");
      });
      nextSocket.addEventListener("message", (message) => {
        const event = localEventFromMessage(message.data);
        if (event !== null) {
          setSession((current) =>
            current !== null && current.sessionId === event.sessionId
              ? sessionAfterEvent(current, event)
              : current,
          );
        }
      });
      nextSocket.addEventListener("close", () => {
        if (cancelled || intentionalClose.current) {
          return;
        }
        setConnection("reconnecting");
        const delay = Math.min(10_000, 500 * 2 ** attempts.current);
        attempts.current += 1;
        reconnectTimer.current = window.setTimeout(connect, delay);
      });
      nextSocket.addEventListener("error", () => {
        // The close event owns reconnect scheduling. Do not expose credential details.
      });
    };

    void bootstrapSession()
      .then((initialSession) => {
        if (cancelled) {
          return;
        }
        setSession(initialSession);
        setConnection("connecting");
        connect();
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof LocalApiClientError
              ? reason
              : new LocalApiClientError({
                  code: "LOCAL_API_UNEXPECTED_ERROR",
                  message: "Unable to establish the local SkillPin session.",
                  recoveryAction: "retry",
                  retryable: true,
                }),
          );
          setConnection("error");
        }
      });

    return () => {
      cancelled = true;
      closeSocket();
    };
  }, [closeSocket]);

  const shutdown = useCallback(async () => {
    intentionalClose.current = true;
    setConnection("exiting");
    closeSocket();
    try {
      await client.shutdown();
    } catch (reason: unknown) {
      intentionalClose.current = false;
      setError(
        reason instanceof LocalApiClientError
          ? reason
          : new LocalApiClientError({
              code: "LOCAL_API_UNEXPECTED_ERROR",
              message: "Unable to end the local SkillPin session.",
              recoveryAction: "retry",
              retryable: true,
            }),
      );
      setConnection("error");
    }
  }, [closeSocket]);

  const value = useMemo<SessionContextValue>(
    () => ({
      connection,
      error,
      isReadOnly: connection !== "online",
      session,
      shutdown,
    }),
    [connection, error, session, shutdown],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession must be used inside SessionProvider.");
  }
  return value;
}
