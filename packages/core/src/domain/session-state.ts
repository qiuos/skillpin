import { CoreError } from "./errors.js";

export type SessionStatus =
  "exiting" | "running" | "starting" | "waiting-to-exit";

export interface SessionState {
  readonly projectFingerprint: string;
  readonly sessionId: string;
  readonly status: SessionStatus;
}

const legalTransitions: Readonly<
  Record<SessionStatus, readonly SessionStatus[]>
> = {
  exiting: [],
  running: ["waiting-to-exit", "exiting"],
  starting: ["running", "exiting"],
  "waiting-to-exit": ["running", "exiting"],
};

export function canTransitionSession(
  from: SessionStatus,
  to: SessionStatus,
): boolean {
  return legalTransitions[from].includes(to);
}

export function transitionSession(
  session: SessionState,
  to: SessionStatus,
): SessionState {
  if (!canTransitionSession(session.status, to)) {
    throw new CoreError(
      `A session cannot transition from ${session.status} to ${to}.`,
      "INVALID_STATE_TRANSITION",
      { fieldPath: "status" },
      false,
      "review-state",
    );
  }

  return { ...session, status: to };
}
