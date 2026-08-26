/** A successful operation result. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed operation result. */
export interface Err<E extends SkillPinError = SkillPinError> {
  readonly ok: false;
  readonly error: E;
}

/** A discriminated union for expected domain outcomes. */
export type Result<T, E extends SkillPinError = SkillPinError> = Ok<T> | Err<E>;

/** Base error used by the SkillPin domain. */
export class SkillPinError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E extends SkillPinError>(error: E): Err<E> {
  return { ok: false, error };
}
