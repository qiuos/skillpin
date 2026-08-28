export const THEME_STORAGE_KEY = "skillpin.theme";

export const themeOptions = [
  { id: "parchment", label: "羊皮卷主题" },
  { id: "dark", label: "深色主题" },
  { id: "light", label: "浅色主题" },
] as const;

export type AppTheme = (typeof themeOptions)[number]["id"];

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

export function isAppTheme(value: string | null): value is AppTheme {
  return themeOptions.some((theme) => theme.id === value);
}

export function loadTheme(storage: Pick<Storage, "getItem">): AppTheme {
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(stored) ? stored : "parchment";
  } catch {
    return "parchment";
  }
}

export function saveTheme(storage: ThemeStorage, theme: AppTheme): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme selection is a convenience preference; the active in-memory choice still applies.
  }
}
