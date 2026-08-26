import type { ManagedSession } from "./session-manager.js";

export interface SessionRegistryResult {
  readonly reused: boolean;
  readonly session: ManagedSession;
}

/** Process-local registry; target fingerprints never expose a project path. */
export class SessionRegistry {
  readonly #sessions = new Map<string, ManagedSession>();
  readonly #starting = new Map<string, Promise<ManagedSession>>();

  public async acquire(
    fingerprint: string,
    create: () => Promise<ManagedSession>,
  ): Promise<SessionRegistryResult> {
    const existing = this.#sessions.get(fingerprint);
    if (existing !== undefined) {
      return { reused: true, session: existing };
    }
    const starting = this.#starting.get(fingerprint);
    if (starting !== undefined) {
      return { reused: true, session: await starting };
    }
    const created = create();
    this.#starting.set(fingerprint, created);
    try {
      const session = await created;
      this.#sessions.set(fingerprint, session);
      return { reused: false, session };
    } finally {
      this.#starting.delete(fingerprint);
    }
  }

  public remove(session: ManagedSession): void {
    if (this.#sessions.get(session.projectFingerprint) === session) {
      this.#sessions.delete(session.projectFingerprint);
    }
  }

  public get size(): number {
    return this.#sessions.size;
  }
}
