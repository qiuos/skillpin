import { describe, expect, it } from "vitest";

import { SkillPinError, err, ok } from "./index.js";

describe("Result helpers", () => {
  it("creates a successful discriminated result", () => {
    expect(ok("ready")).toEqual({ ok: true, value: "ready" });
  });

  it("preserves a typed domain error", () => {
    const error = new SkillPinError("Missing project", "PROJECT_NOT_FOUND");

    expect(err(error)).toEqual({ ok: false, error });
  });
});

import { LOCAL_API_VERSION, type LocalSessionInfo } from "./index.js";

describe("browser-safe local API contracts", () => {
  it("exports the versioned session contract from the core root", () => {
    const session: LocalSessionInfo = {
      clientCount: 0,
      projectDirectory: "/projects/example",
      projectFingerprint: "fingerprint",
      sessionId: "session",
      status: "running",
      waitingToExitAt: null,
    };

    expect(LOCAL_API_VERSION).toBe(1);
    expect(session.status).toBe("running");
  });
});
