import { describe, expect, it } from "vitest";

import {
  CoreError,
  canTransitionChangeSet,
  canTransitionSession,
  serializeSkillPinError,
  transitionChangeSet,
  transitionSession,
} from "../index.js";

describe("P2 domain state contracts", () => {
  it("allows only declared change-set transitions", () => {
    expect(canTransitionChangeSet("draft", "planned")).toBe(true);
    expect(canTransitionChangeSet("planned", "applying")).toBe(true);
    expect(canTransitionChangeSet("applying", "applied")).toBe(true);
    expect(canTransitionChangeSet("applied", "draft")).toBe(false);

    expect(
      transitionChangeSet(
        {
          baseRevision: 2,
          changes: [],
          id: "change-1",
          status: "draft",
        },
        "planned",
      ),
    ).toMatchObject({ status: "planned" });
  });

  it("rejects illegal state changes with serializable stable errors", () => {
    expect(() =>
      transitionSession(
        {
          projectFingerprint: "project",
          sessionId: "session",
          status: "exiting",
        },
        "running",
      ),
    ).toThrow(CoreError);

    const error = new CoreError(
      "The document is invalid.",
      "INVALID_USER_CONFIG",
      { filePath: "/tmp/skillpin.json", fieldPath: "sources[0].id" },
      false,
      "fix-file",
    );

    expect(serializeSkillPinError(error)).toEqual({
      code: "INVALID_USER_CONFIG",
      details: { filePath: "/tmp/skillpin.json", fieldPath: "sources[0].id" },
      message: "The document is invalid.",
      recoveryAction: "fix-file",
      retryable: false,
    });
  });

  it("allows the session lifecycle to pause while waiting for a process exit", () => {
    expect(canTransitionSession("starting", "running")).toBe(true);
    expect(canTransitionSession("running", "waiting-to-exit")).toBe(true);
    expect(canTransitionSession("waiting-to-exit", "running")).toBe(true);
    expect(canTransitionSession("waiting-to-exit", "exiting")).toBe(true);
  });
});
