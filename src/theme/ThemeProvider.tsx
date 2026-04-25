import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AppTheme } from "@/lib/theme";
import { applyTheme, getStoredTheme, persistTheme } from "@/lib/theme";

const ThemeContext = createContext<{
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => getStoredTheme());

  const setTheme = useCallback((t: AppTheme) => {
    setThemeState(t);
    persistTheme(t);
    applyTheme(t);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): { theme: AppTheme; setTheme: (t: AppTheme) => void } {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
