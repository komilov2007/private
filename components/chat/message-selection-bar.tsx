"use client";

import { ChevronLeft, Loader2, Trash2 } from "lucide-react";

type Props = {
  count: number;
  confirming: boolean;
  deleting: boolean;
  onBack: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

export default function MessageSelectionBar({ count, confirming, deleting, onBack, onRequestDelete, onCancelDelete, onConfirmDelete }: Props) {
  return (
    <>
      <header className="chat-header relative z-30 flex min-h-[3.75rem] items-center gap-2 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3">
        <button type="button" onClick={onBack} disabled={deleting} className="icon-button" aria-label="Tanlashni bekor qilish"><ChevronLeft size={24} /></button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{count} ta tanlandi</p>
        <button type="button" onClick={onRequestDelete} disabled={!count || deleting} className="icon-button text-[var(--danger)]" aria-label="Tanlangan xabarlarni o'chirish"><Trash2 size={20} /></button>
      </header>
      {confirming ? (
        <div className="sheet-backdrop">
          <section className="bottom-sheet p-5" role="alertdialog" aria-modal="true" aria-labelledby="selection-delete-title" aria-describedby="selection-delete-description">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/10 text-[var(--danger)]"><Trash2 /></div>
            <h2 id="selection-delete-title" className="text-center text-lg font-bold">Tanlangan xabarlarni o&apos;chirish?</h2>
            <p id="selection-delete-description" className="muted mt-2 text-center text-sm">{count} ta xabar o&apos;chiriladi.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" disabled={deleting} onClick={onCancelDelete} className="h-11 rounded-xl bg-[var(--surface-elevated)] text-sm font-bold">Bekor qilish</button>
              <button type="button" disabled={deleting} onClick={onConfirmDelete} className="primary-button bg-[var(--danger)]">{deleting ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />} O&apos;chirish</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
