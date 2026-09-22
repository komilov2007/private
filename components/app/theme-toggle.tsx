"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@/lib/identity";
import { useTheme } from "./theme-provider";

const NEXT: Record<ThemePreference, ThemePreference> = { light: "dark", dark: "system", system: "light" };
const LABEL: Record<ThemePreference, string> = { light: "Yorug'", dark: "Tungi", system: "Tizim" };

/** Compact appearance shortcut: cycles Light → Dark → System. */
export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Laptop;
  return (
    <button
      type="button"
      className="icon-button glass-button"
      onClick={() => setPreference(NEXT[preference])}
      aria-label={`Ko'rinish: ${LABEL[preference]}. ${LABEL[NEXT[preference]]}ga o'tish`}
      title={`Ko'rinish: ${LABEL[preference]}`}
    >
      <Icon size={19} />
    </button>
  );
}
