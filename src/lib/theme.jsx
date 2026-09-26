import { createContext, useContext, useState, useCallback } from "react";
import { applyTheme } from "./design.js";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem("inforce-theme") === "dark";
    } catch {
      return false;
    }
  });

  // Apply theme to DS + presets SYNCHRONOUSLY before render
  applyTheme(isDark);

  const toggleTheme = useCallback(() => {
    setIsDark((d) => {
      const next = !d;
      try { localStorage.setItem("inforce-theme", next ? "dark" : "light"); } catch {}
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { isDark: true, toggleTheme: () => {} };
  return ctx;
}
