"use client";

import { Check, Send, X } from "lucide-react";
import ThemeSelector from "@/components/app/theme-selector";
import { useTheme } from "@/components/app/theme-provider";
import { wallpapersFor } from "@/lib/wallpapers";

export default function ChatSettings({ selected, onApply, onPropose, onClose }: { selected: string | null; onApply: (id: string) => void; onPropose: (id: string) => Promise<void>; onClose: () => void }) {
  const { identity } = useTheme();
  return <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="bottom-sheet p-5">
    <header className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold">Chat sozlamalari</h2><p className="muted text-sm">Ko&apos;rinish va chat foni</p></div><button className="icon-button" onClick={onClose}><X /></button></header>
    <h3 className="mb-2 text-sm font-bold">Ko&apos;rinish</h3><ThemeSelector />
    <h3 className="mb-3 mt-6 text-sm font-bold">Chat foni</h3>
    <div className="grid grid-cols-2 gap-3">{wallpapersFor(identity).map((wallpaper) => <div key={wallpaper.id} className="overflow-hidden rounded-xl border border-[var(--border)]"><div className="aspect-[4/3] p-3" style={{ background: wallpaper.css }}><div className="ml-auto max-w-[70%] rounded-xl bg-[var(--sent)] px-2 py-1 text-[9px] text-white">Salom!</div><div className="mt-2 max-w-[75%] rounded-xl bg-[var(--received)] px-2 py-1 text-[9px] text-[var(--received-text)]">Qalaysiz?</div></div><div className="bg-[var(--surface-elevated)] p-2"><p className="truncate text-xs font-bold">{wallpaper.name}</p><div className="mt-2 flex gap-1"><button onClick={() => onApply(wallpaper.id)} className="flex h-8 flex-1 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]">{selected === wallpaper.id ? <Check size={13} /> : "Men uchun"}</button><button onClick={() => void onPropose(wallpaper.id)} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-white" aria-label="Taklif qilish"><Send size={13} /></button></div></div></div>)}</div>
  </section></div>;
}
