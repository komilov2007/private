import { EMOJIS } from "@/lib/chat/constants";

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow)]">
      {EMOJIS.map((emoji) => (
        <button key={emoji} type="button" onClick={() => onPick(emoji)} className="grid aspect-square place-items-center rounded-xl text-[22px] transition hover:bg-[var(--accent-soft)] active:scale-90" aria-label={`Emoji ${emoji}`}>
          {emoji}
        </button>
      ))}
    </div>
  );
}
