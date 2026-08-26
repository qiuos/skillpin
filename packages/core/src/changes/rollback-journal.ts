import type {
  ExpectedManagedLink,
  ManagedDirectoryLink,
} from "../platform/platform-link-adapter.js";

export interface LinkRollbackEntry {
  readonly backupPath: string | null;
  readonly createdLink: ManagedDirectoryLink | null;
  readonly finalPath: string;
  readonly originalLink: ExpectedManagedLink | null;
  readonly temporaryPath: string | null;
}

/** Transaction-local state used to reverse filesystem operations in strict order. */
export class RollbackJournal {
  readonly #entries: LinkRollbackEntry[] = [];

  public record(entry: LinkRollbackEntry): void {
    this.#entries.push(entry);
  }

  public replaceForFinal(
    finalPath: string,
    update: (entry: LinkRollbackEntry) => LinkRollbackEntry,
  ): void {
    const index = this.#entries.findIndex(
      (entry) => entry.finalPath === finalPath,
    );
    if (index < 0) {
      throw new Error("Cannot update a rollback entry that was not recorded.");
    }
    const entry = this.#entries[index];
    if (entry === undefined) {
      throw new Error("Rollback entry disappeared unexpectedly.");
    }
    this.#entries[index] = update(entry);
  }

  public entriesInReverse(): readonly LinkRollbackEntry[] {
    return [...this.#entries].reverse();
  }

  public entries(): readonly LinkRollbackEntry[] {
    return this.#entries;
  }
}
