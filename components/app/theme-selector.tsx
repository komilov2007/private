"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@/lib/identity";
import { useTheme } from "./theme-provider";

const options: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Yorug'", icon: Sun },
  { value: "dark", label: "Tungi", icon: Moon },
  { value: "system", label: "Tizim", icon: Laptop },
];

export default function ThemeSelector() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="theme-segment" role="radiogroup" aria-label="Ko'rinish">
      {options.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={preference === value} data-active={preference === value} onClick={() => setPreference(value)}>
          <Icon size={16} /> <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
