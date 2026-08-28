import { describe, expect, it, vi } from "vitest";

import { loadTheme, saveTheme, THEME_STORAGE_KEY } from "./theme-preference.js";

describe("theme preference", () => {
  it("uses parchment when no preference exists or its value is invalid", () => {
    expect(loadTheme({ getItem: () => null })).toBe("parchment");
    expect(loadTheme({ getItem: () => "sepia" })).toBe("parchment");
  });

  it("restores a saved supported theme", () => {
    expect(loadTheme({ getItem: () => "dark" })).toBe("dark");
    expect(loadTheme({ getItem: () => "light" })).toBe("light");
  });

  it("persists the chosen theme without surfacing storage failures", () => {
    const setItem = vi.fn();
    saveTheme({ getItem: () => null, setItem }, "light");
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "light");
    expect(() =>
      saveTheme(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("storage unavailable");
          },
        },
        "dark",
      ),
    ).not.toThrow();
  });
});
