import { ref, type Ref } from "vue";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "agentflow:theme";

const DEFAULT_THEME: ThemeMode = "dark";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function readTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function setTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Still apply in-memory when storage is unavailable.
  }
  applyTheme(mode);
}

export function useTheme(): {
  theme: Ref<ThemeMode>;
  setTheme: (mode: ThemeMode) => void;
} {
  const theme = ref<ThemeMode>(readTheme());

  function setThemeAndSync(mode: ThemeMode): void {
    setTheme(mode);
    theme.value = mode;
  }

  return { theme, setTheme: setThemeAndSync };
}
