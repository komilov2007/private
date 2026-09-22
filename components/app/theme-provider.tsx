"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ThemePreference, UserIdentity } from "@/lib/identity";
import { themeStorageKey } from "@/lib/identity";

type ThemeContextValue = {
  identity: UserIdentity;
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_EVENT = "private-messenger-theme";
const PREFERENCES: ThemePreference[] = ["light", "dark", "system"];

function readPreference(identity: UserIdentity): ThemePreference {
  try {
    const saved = localStorage.getItem(themeStorageKey(identity)) as ThemePreference | null;
    return saved && PREFERENCES.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function subscribePreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_EVENT, callback);
  };
}

function subscribeSystem(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export default function ThemeProvider({ identity, children }: { identity: UserIdentity; children: React.ReactNode }) {
  // useSyncExternalStore renders the server snapshot during hydration, then the saved value: no mismatch.
  const preference = useSyncExternalStore(subscribePreference, () => readPreference(identity), () => "system" as ThemePreference);
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia("(prefers-color-scheme: dark)").matches, () => false);
  const resolved: "light" | "dark" = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    try {
      localStorage.setItem("last-identity", identity);
    } catch {
      // Storage unavailable (private mode): theme still applies for this session.
    }
    const root = document.documentElement;
    root.dataset.identity = identity;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    const background = getComputedStyle(root).getPropertyValue("--app-bg").trim();
    if (meta && background) meta.setAttribute("content", background);
  }, [identity, resolved]);

  const setPreference = useCallback((value: ThemePreference) => {
    try {
      localStorage.setItem(themeStorageKey(identity), value);
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, [identity]);

  const value = useMemo(() => ({ identity, preference, resolved, setPreference }), [identity, preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
