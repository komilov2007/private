import { X } from "lucide-react";
import type { Message, Profile } from "@/lib/chat/types";
import { messagePreview } from "@/lib/chat/messages";

export default function ReplyPreview({ message, profile, onCancel }: { message: Message; profile: Profile | null; onCancel: () => void }) {
  return (
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-2">
      <div className="min-w-0 flex-1 border-l-[3px] border-[var(--accent)] pl-3">
        <p className="text-xs font-semibold text-[var(--accent)]">{profile?.display_name ?? "Suhbatdosh"}ga javob</p>
        <p className="muted truncate text-sm">{messagePreview(message)}</p>
      </div>
      <button type="button" onClick={onCancel} aria-label="Javobni bekor qilish" className="icon-button h-9 w-9"><X size={18} /></button>
    </div>
  );
}
