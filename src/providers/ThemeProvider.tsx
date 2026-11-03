import { createContext, use, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

type Theme = "dark" | "light";
/** What the user picked: a theme, or whatever the system uses (the default). */
export type ThemePref = Theme | "system";

interface ThemeCtxValue {
  /** The theme on screen. */
  theme: Theme;
  pref: ThemePref;
  /** Where `toggle` goes next. */
  nextPref: ThemePref;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeCtxValue>({
  theme: "dark",
  pref: "system",
  nextPref: "light",
  toggle: () => {},
});

const LIGHT_QUERY = "(prefers-color-scheme: light)";
const systemTheme = (): Theme => (window.matchMedia?.(LIGHT_QUERY).matches ? "light" : "dark");
const readPref = (v: string | null): ThemePref => (v === "light" || v === "dark" ? v : "system");
const opposite = (t: Theme): Theme => (t === "dark" ? "light" : "dark");

function applyTheme(theme: Theme) {
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
}

// Apply once at module load so the first paint matches (index.html does the
// same even earlier).
{
  const pref = readPref(localStorage.getItem("theme"));
  applyTheme(pref === "system" ? systemTheme() : pref);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorage("theme", "system");
  const pref = readPref(stored);

  // Follow the system as it changes (an evening switch to dark, say).
  const [system, setSystem] = useState<Theme>(systemTheme);
  useEffect(() => {
    const mq = window.matchMedia?.(LIGHT_QUERY);
    if (!mq) return;
    const onChange = () => setSystem(mq.matches ? "light" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: Theme = pref === "system" ? system : pref;
  useEffect(() => applyTheme(theme), [theme]);

  // One button cycles all three, each click changing something visible
  // first: from the system's theme to the other one, then back to the
  // system's own theme held fixed, then to following the system again.
  const nextPref: ThemePref =
    pref === "system" ? opposite(system) : pref === opposite(system) ? system : "system";
  const toggle = () => setStored(nextPref);

  return <ThemeCtx value={{ theme, pref, nextPref, toggle }}>{children}</ThemeCtx>;
}

export const useTheme = () => use(ThemeCtx);
