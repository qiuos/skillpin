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
