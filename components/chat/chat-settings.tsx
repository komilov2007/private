"use client";

import { Check, Loader2, RotateCw, Send, Trash2, X } from "lucide-react";
import { useState } from "react";
import ThemeSelector from "@/components/app/theme-selector";
import { useTheme } from "@/components/app/theme-provider";
import { wallpapersFor } from "@/lib/wallpapers";

type Props = { selected: string | null; onApply: (id: string) => void; onPropose: (id: string) => Promise<void>; onClear: () => Promise<boolean>; pendingCleanup: boolean; onRetryCleanup: () => Promise<void>; onClose: () => void };

export default function ChatSettings({ selected, onApply, onPropose, onClear, pendingCleanup, onRetryCleanup, onClose }: Props) {
  const { identity } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  async function clearChat() {
    if (clearing) return;
    setClearing(true);
    const cleared = await onClear();
    setClearing(false);
    if (cleared) onClose();
  }
  if (confirming) return <div className="sheet-backdrop"><section className="bottom-sheet p-5" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description">
    <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/10 text-[var(--danger)]"><Trash2 /></div>
    <h2 id="clear-title" className="text-center text-lg font-bold">Chatni tozalash?</h2>
    <p id="clear-description" className="muted mx-auto mt-2 max-w-sm text-center text-sm">Rahmatulloh va Nilufar o&apos;rtasidagi barcha xabarlar o&apos;chiriladi. Bu amalni ortga qaytarib bo&apos;lmaydi.</p>
    <div className="mt-5 grid grid-cols-2 gap-2">
      <button type="button" disabled={clearing} onClick={() => setConfirming(false)} className="h-11 rounded-xl bg-[var(--surface-elevated)] text-sm font-bold">Bekor qilish</button>
      <button type="button" disabled={clearing} onClick={() => void clearChat()} className="primary-button bg-[var(--danger)]">{clearing ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />} Barcha xabarlarni o&apos;chirish</button>
    </div>
  </section></div>;
  return <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="bottom-sheet p-5">
    <header className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold">Chat sozlamalari</h2><p className="muted text-sm">Ko&apos;rinish va chat foni</p></div><button className="icon-button" onClick={onClose}><X /></button></header>
    <h3 className="mb-2 text-sm font-bold">Ko&apos;rinish</h3><ThemeSelector />
    <h3 className="mb-3 mt-6 text-sm font-bold">Chat foni</h3>
    <div className="grid grid-cols-2 gap-3">{wallpapersFor(identity).map((wallpaper) => <div key={wallpaper.id} className="overflow-hidden rounded-xl border border-[var(--border)]"><div className="aspect-[4/3] p-3" style={{ background: wallpaper.css }}><div className="ml-auto max-w-[70%] rounded-xl bg-[var(--sent)] px-2 py-1 text-[9px] text-white">Salom!</div><div className="mt-2 max-w-[75%] rounded-xl bg-[var(--received)] px-2 py-1 text-[9px] text-[var(--received-text)]">Qalaysiz?</div></div><div className="bg-[var(--surface-elevated)] p-2"><p className="truncate text-xs font-bold">{wallpaper.name}</p><div className="mt-2 flex gap-1"><button onClick={() => onApply(wallpaper.id)} className="flex h-8 flex-1 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]">{selected === wallpaper.id ? <Check size={13} /> : "Men uchun"}</button><button onClick={() => void onPropose(wallpaper.id)} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-white" aria-label="Taklif qilish"><Send size={13} /></button></div></div></div>)}</div>
    <div className="mt-6 border-t border-[var(--border)] pt-4">
      {pendingCleanup ? <button type="button" onClick={() => void onRetryCleanup()} className="action-item mb-2"><RotateCw size={18} /> Media tozalashni qayta urinish</button> : null}
      <button type="button" onClick={() => setConfirming(true)} className="action-item" data-danger><Trash2 size={18} /> Chatni tozalash</button>
    </div>
  </section></div>;
}
