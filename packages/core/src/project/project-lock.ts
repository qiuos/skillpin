import path from "node:path";

/**
 * A deliberately in-process, non-queuing mutex. P5 owns any future
 * cross-process session protocol; P4 must fail fast rather than race writers.
 */
export class ProjectLock {
  readonly #held = new Set<string>();

  public tryAcquire(projectDirectory: string): ProjectLockLease | null {
    const key = path.resolve(projectDirectory);
    if (this.#held.has(key)) {
      return null;
    }
    this.#held.add(key);
    return new ProjectLockLease(this.#held, key);
  }
}

export class ProjectLockLease {
  #released = false;

  public constructor(
    private readonly held: Set<string>,
    private readonly key: string,
  ) {}

  public release(): void {
    if (!this.#released) {
      this.held.delete(this.key);
      this.#released = true;
    }
  }
}
