import { useEffect, useState } from "react";

import { loadTheme, saveTheme, type AppTheme } from "./theme-preference.js";

export function useThemePreference(): readonly [
  AppTheme,
  (theme: AppTheme) => void,
] {
  const [theme, setTheme] = useState(() => loadTheme(window.localStorage));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(window.localStorage, theme);
  }, [theme]);

  return [theme, setTheme];
}
