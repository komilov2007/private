import type { UserIdentity } from "./identity";

export const WALLPAPERS = {
  rahmatulloh: [
    { id: "midnight", name: "Midnight Mountains", css: "radial-gradient(circle at 70% 15%,#31558a55,transparent 30%),linear-gradient(155deg,#07101f,#151f30)" },
    { id: "city", name: "City Night", css: "linear-gradient(145deg,#111827,#26364f 55%,#080d16)" },
    { id: "ocean", name: "Ocean Night", css: "radial-gradient(circle at 20% 20%,#1c789455,transparent 35%),linear-gradient(150deg,#061721,#0d3040)" },
    { id: "minimal-blue", name: "Minimal Blue", css: "linear-gradient(145deg,#dce7f6,#f7faff)" },
  ],
  nilufar: [
    { id: "rose", name: "Rose", css: "radial-gradient(circle at 20% 15%,#f19ab055,transparent 30%),linear-gradient(145deg,#fff0f4,#fbdde6)" },
    { id: "sunset", name: "Soft Sunset", css: "linear-gradient(145deg,#ffd9cc,#f3b9c9 52%,#cabbe8)" },
    { id: "plum", name: "Elegant Plum", css: "radial-gradient(circle at 80% 15%,#a5427055,transparent 28%),linear-gradient(145deg,#210f1a,#4b2035)" },
    { id: "blush", name: "Warm Blush", css: "linear-gradient(145deg,#fff7f5,#fbe7ec)" },
  ],
} as const;

export function wallpapersFor(identity: UserIdentity) { return WALLPAPERS[identity]; }
export function wallpaperCss(id?: string | null) {
  return [...WALLPAPERS.rahmatulloh, ...WALLPAPERS.nilufar].find((item) => item.id === id)?.css;
}
