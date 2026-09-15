"use client";

/**
 * RECODE theme system - LIGHT is the default (white + #CCFF00); dark remains
 * fully available via the toggle. The SSR-rendered <html data-theme>
 * attribute comes from the persistence cookie (see app/layout.tsx), so
 * server and client hydrate identically. This provider reads that attribute
 * at mount, keeps it in sync on toggle, and mirrors the choice to the
 * cookie + localStorage (same key). Pre-cookie localStorage preferences
 * migrate once, post-hydration. Switching UI colors only - no data or
 * layout logic.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type Theme = "dark" | "light";
const STORAGE_KEY = "recode.theme";
/** Cookie mirrors localStorage so the server can SSR the correct attribute. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}>({ theme: "light", setTheme: () => {}, toggle: () => {} });

function persist(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
    document.cookie = `${STORAGE_KEY}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    /* storage unavailable - SSR default (light) remains */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy init from the SSR-rendered attribute: the provider renders no
  // attributes itself, so this client-only read cannot affect hydration
  // output - it just keeps context state in step with the server-rendered
  // DOM from the very first render (no transient wrong-theme apply).
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    }
    return "light";
  });
  const firstApply = useRef(true);

  useEffect(() => {
    // Legacy migration: pre-cookie preferences stored only in localStorage
    // apply now - post-hydration - and are mirrored to the cookie so the
    // next SSR request renders them. (Light is the SSR default; only an
    // explicitly saved "dark" needs restoring here.)
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "dark" && document.documentElement.dataset.theme !== "dark") {
        document.documentElement.dataset.theme = "dark";
        setThemeState("dark");
        persist("dark");
      } else if (
        saved === "light" &&
        document.documentElement.dataset.theme !== "light"
      ) {
        document.documentElement.dataset.theme = "light";
        setThemeState("light");
        persist("light");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const apply = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t;
    // Animate only user-initiated switches, never the initial mount.
    if (firstApply.current) {
      firstApply.current = false;
      return;
    }
    const root = document.documentElement;
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 320);
  }, []);

  useEffect(() => {
    apply(theme);
  }, [theme, apply]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persist(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      persist(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}