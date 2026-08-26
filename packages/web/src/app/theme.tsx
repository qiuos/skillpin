import { useEffect, useState } from "react";

import { Radio } from "../components/controls.js";

export type ThemePreference = "dark" | "light" | "system";

const THEME_STORAGE_KEY = "skillpin.theme";

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): "dark" | "light" {
  return preference === "system"
    ? systemPrefersDark
      ? "dark"
      : "light"
    : preference;
}

function initialPreference(): ThemePreference {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" || stored === "light" || stored === "system"
    ? stored
    : "system";
}

export function useThemePreference(): readonly [
  ThemePreference,
  (preference: ThemePreference) => void,
] {
  const [preference, setPreference] =
    useState<ThemePreference>(initialPreference);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(
        preference,
        media.matches,
      );
    };
    apply();
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  return [preference, setPreference];
}

export function ThemePicker({
  preference,
  setPreference,
}: {
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}) {
  return (
    <fieldset className="theme-picker">
      <legend>界面外观</legend>
      <p>选择 SkillPin 在此浏览器中的显示主题。</p>
      <Radio
        checked={preference === "system"}
        label="跟随系统设置"
        name="theme"
        onChange={() => setPreference("system")}
      />
      <Radio
        checked={preference === "dark"}
        label="深色模式"
        name="theme"
        onChange={() => setPreference("dark")}
      />
      <Radio
        checked={preference === "light"}
        label="浅色模式"
        name="theme"
        onChange={() => setPreference("light")}
      />
    </fieldset>
  );
}
