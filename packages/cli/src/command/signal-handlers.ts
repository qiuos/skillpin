import type { ManagedSession } from "../session/session-manager.js";

export interface SignalSource {
  off(event: "SIGINT" | "SIGTERM", listener: () => void): void;
  once(event: "SIGINT" | "SIGTERM", listener: () => void): void;
}

/** Keeps process signal wiring at the command boundary and removable in tests. */
export function attachSignalHandlers(
  session: ManagedSession,
  source: SignalSource = process,
): () => void {
  const close = () => {
    void session.close("signal");
  };
  const dispose = () => {
    source.off("SIGINT", close);
    source.off("SIGTERM", close);
  };
  source.once("SIGINT", close);
  source.once("SIGTERM", close);
  session.onClosed(dispose);
  return dispose;
}
