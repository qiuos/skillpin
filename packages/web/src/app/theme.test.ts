import { describe, expect, it } from "vitest";

import { resolveTheme } from "./theme.js";

describe("resolveTheme", () => {
  it("follows the system only while the system preference is selected", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});
