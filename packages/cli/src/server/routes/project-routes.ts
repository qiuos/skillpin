import type { IncomingMessage, ServerResponse } from "node:http";

import {
  LOCAL_API_VERSION,
  type LocalApiError,
  type LocalApiSuccess,
  type LocalProjectApplyInput,
  type LocalProjectPlanResponse,
  type LocalProjectSelectionInput,
  type LocalProjectSnapshot,
  type ProjectSnapshot,
} from "@skillpin/core";
import { planProjectChanges } from "@skillpin/core/changes";

import type { LocalApiRoute } from "./types.js";

const MAX_REQUEST_BODY_BYTES = 32 * 1024;

function success<T>(data: T): LocalApiSuccess<T> {
  return { data, version: LOCAL_API_VERSION };
}

function write(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function failure(
  response: ServerResponse,
  status: number,
  error: LocalApiError,
): void {
  write(response, { error, version: LOCAL_API_VERSION }, status);
}

function errorFrom(error: {
  readonly code: string;
  readonly message: string;
  readonly recoveryAction: string;
  readonly retryable: boolean;
}): LocalApiError {
  return {
    code: error.code,
    message: error.message,
    recoveryAction:
      error.recoveryAction === "manual-recovery"
        ? "manual-recovery"
        : error.retryable
          ? "retry"
          : "review-state",
    retryable: error.retryable,
  };
}

function snapshotForBrowser(snapshot: ProjectSnapshot): LocalProjectSnapshot {
  return {
    links: snapshot.links.map((link) => ({
      linkName: link.linkName,
      sourceState: link.sourceState,
      state: link.state,
    })),
    manifestRevision: snapshot.manifestRevision,
    recoveryDiagnostics: snapshot.recoveryDiagnostics.map(({ kind, path }) => ({
      kind,
      path,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSelections(
  value: unknown,
): value is readonly LocalProjectSelectionInput[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.linkName === "string" &&
        (entry.candidateId === null || typeof entry.candidateId === "string"),
    )
  );
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > MAX_REQUEST_BODY_BYTES) throw new Error("too-large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function selectionInput(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<readonly LocalProjectSelectionInput[] | null> {
  try {
    const body = await readJson(request);
    if (!isRecord(body) || !isSelections(body.selections))
      throw new Error("invalid");
    return body.selections;
  } catch {
    failure(response, 400, {
      code: "API_REQUEST_INVALID",
      message:
        "Selections must be valid JSON with link names and candidate ids.",
      recoveryAction: "review-state",
      retryable: false,
    });
    return null;
  }
}

function planForBrowser(
  snapshot: ProjectSnapshot,
  plan: ReturnType<typeof planProjectChanges>,
): LocalProjectPlanResponse {
  return {
    baseRevision: plan.baseRevision,
    blockers: plan.blockers,
    changes: plan.changes.map((change) => ({
      candidateId: change.candidate?.id ?? null,
      kind: change.kind,
      linkName: change.linkName,
    })),
  };
}

/** P9 project inspection, plan, and explicit apply routes. */
export function createProjectRoutes(): readonly LocalApiRoute[] {
  return [
    {
      method: "GET",
      path: "/api/project",
      async handle(_request, response, session) {
        const snapshot =
          await session.projectServices.snapshotService.inspect();
        if (!snapshot.ok)
          return failure(response, 422, errorFrom(snapshot.error));
        write(response, success(snapshotForBrowser(snapshot.value)));
      },
    },
    {
      method: "POST",
      path: "/api/project/plan",
      async handle(request, response, session) {
        const input = await selectionInput(request, response);
        if (input === null) return;
        const [snapshot, selections] = await Promise.all([
          session.projectServices.snapshotService.inspect(),
          session.sourceRuntime.projectSelections(input),
        ]);
        if (!snapshot.ok)
          return failure(response, 422, errorFrom(snapshot.error));
        if (!selections.ok)
          return failure(response, 422, errorFrom(selections.error));
        write(
          response,
          success(
            planForBrowser(
              snapshot.value,
              planProjectChanges(snapshot.value, selections.value),
            ),
          ),
        );
      },
    },
    {
      method: "POST",
      path: "/api/project/apply",
      async handle(request, response, session) {
        let body: unknown;
        try {
          body = await readJson(request);
        } catch {
          failure(response, 400, {
            code: "API_REQUEST_INVALID",
            message: "The apply request must be valid JSON.",
            recoveryAction: "review-state",
            retryable: false,
          });
          return;
        }
        if (
          !isRecord(body) ||
          typeof body.baseRevision !== "number" ||
          typeof body.requestId !== "string" ||
          !isSelections(body.selections)
        ) {
          failure(response, 400, {
            code: "API_REQUEST_INVALID",
            message:
              "An apply request requires a revision, request id, and valid selections.",
            recoveryAction: "review-state",
            retryable: false,
          });
          return;
        }
        const input = body as unknown as LocalProjectApplyInput;
        const selections = await session.sourceRuntime.projectSelections(
          input.selections,
        );
        if (!selections.ok)
          return failure(response, 422, errorFrom(selections.error));
        const applied = await session.runProjectOperation(() =>
          session.projectServices.changeService.apply({
            baseRevision: input.baseRevision,
            requestId: input.requestId,
            selections: selections.value,
          }),
        );
        if (!applied.ok)
          return failure(response, 422, errorFrom(applied.error));
        write(
          response,
          success({
            idempotent: applied.value.idempotent,
            snapshot: snapshotForBrowser(applied.value.snapshot),
          }),
        );
      },
    },
  ];
}
