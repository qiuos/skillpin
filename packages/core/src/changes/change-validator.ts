import { CoreError } from "../domain/errors.js";
import type { ProjectSnapshot } from "../domain/project-state.js";
import { err, ok, type Result } from "../shared/result.js";
import type { ChangePlan } from "./change-planner.js";

/** Turns stale snapshots and pure-plan blockers into stable apply-time errors. */
export function validateChangePlan(
  snapshot: ProjectSnapshot,
  baseRevision: number,
  requestId: string,
  plan: ChangePlan,
): Result<void, CoreError> {
  if (!isSafeChangeRequestId(requestId)) {
    return err(
      new CoreError(
        "A change request requires a non-empty stable request id.",
        "CHANGESET_INVALID",
        { fieldPath: "requestId", requestId },
        false,
        "review-state",
      ),
    );
  }
  if (baseRevision !== snapshot.manifestRevision) {
    return err(
      new CoreError(
        "The project changed since this selection was prepared.",
        "REVISION_CONFLICT",
        { requestId },
        true,
        "review-state",
      ),
    );
  }
  if (plan.baseRevision !== baseRevision || plan.blockers.length > 0) {
    const blocker = plan.blockers[0];
    return err(
      new CoreError(
        blocker?.message ?? "The change plan is not valid for this project.",
        "PROJECT_STATE_CONFLICT",
        {
          ...(blocker === undefined ? {} : { linkName: blocker.linkName }),
          requestId,
        },
        false,
        "review-state",
      ),
    );
  }
  return ok(undefined);
}

export function isSafeChangeRequestId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}
