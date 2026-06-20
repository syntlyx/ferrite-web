import { createContext, use } from "react";
import type { ReactNode } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

type Theme = "dark" | "light";

interface ThemeCtxValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeCtxValue>({ theme: "dark", toggle: () => {} });

function applyTheme(theme: Theme) {
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
}

// Apply once at module load so the first paint matches the stored theme.
applyTheme(localStorage.getItem("theme") === "light" ? "light" : "dark");

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorage("theme", "dark");
  const theme: Theme = stored === "light" ? "light" : "dark";

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setStored(next);
  };

  return <ThemeCtx value={{ theme, toggle }}>{children}</ThemeCtx>;
}

export const useTheme = () => use(ThemeCtx);
