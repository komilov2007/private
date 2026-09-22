import Image from "next/image";
import { STICKERS } from "@/lib/chat/constants";

export default function StickerPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-3 shadow-[var(--shadow)]">
      {STICKERS.map((sticker) => (
        <button key={sticker.id} type="button" onClick={() => onPick(sticker.id)} className="grid aspect-square place-items-center rounded-2xl transition hover:bg-[var(--accent-soft)] active:scale-95" aria-label={sticker.label}>
          <Image src={sticker.src} alt={sticker.label} width={56} height={56} />
        </button>
      ))}
    </div>
  );
}
