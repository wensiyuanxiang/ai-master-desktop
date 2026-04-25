export type AppTheme = "light" | "dark";

const STORAGE_KEY = "ai-master-theme";

export function getStoredTheme(): AppTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyTheme(theme: AppTheme): void {
  if (theme === "dark") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
  }
}

export function persistTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Call before React mount; returns resolved theme. */
export function initTheme(): AppTheme {
  const t = getStoredTheme();
  applyTheme(t);
  return t;
}
