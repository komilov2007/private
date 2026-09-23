import { ChevronLeft, MoreVertical, Phone, Video } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/app/avatar";
import type { Profile } from "@/lib/chat/types";
import { lastSeenLabel } from "@/lib/chat/helpers";
import type { HubStatus } from "@/lib/realtime/conversation-hub";
import { useCalls } from "@/components/calls/call-provider";

type Props = {
  other: Profile | null;
  name: string;
  online: boolean;
  typing: boolean;
  status: HubStatus;
  onDetails: () => void;
  onSettings: () => void;
};

export default function ChatHeader({ other, name, online, typing, status, onDetails, onSettings }: Props) {
  const { startCall, activeCall, canCall } = useCalls();
  const line = typing
    ? "yozmoqda"
    : status === "reconnecting" || status === "error"
      ? "Ulanmoqda…"
      : online
        ? "Onlayn"
        : lastSeenLabel(other?.last_seen_at ?? null) || (status === "connecting" ? "Ulanmoqda…" : "");
  const highlighted = typing || (online && status === "live");

  return (
    <header className="chat-header relative z-30 flex items-center gap-1 px-1.5 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3">
      <Link href="/" className="icon-button" aria-label="Orqaga"><ChevronLeft size={24} /></Link>
      <button type="button" onClick={onDetails} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 py-1 text-left transition hover:bg-[var(--accent-soft)]">
        <span className="relative">
          <Avatar profile={other} size="md" />
          {online ? <i className="presence-dot" aria-hidden="true" /> : null}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-5">{name}</span>
          <span className={`flex items-center truncate text-xs leading-4 ${highlighted ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
            {line}
            {typing ? <span className="typing-dots"><i /><i /><i /></span> : null}
          </span>
        </span>
      </button>
      <button type="button" disabled={!canCall || !other || Boolean(activeCall)} onClick={() => void startCall("audio")} aria-label="Audio qo'ng'iroq" className="icon-button"><Phone size={19} /></button>
      <button type="button" disabled={!canCall || !other || Boolean(activeCall)} onClick={() => void startCall("video")} aria-label="Video qo'ng'iroq" className="icon-button"><Video size={20} /></button>
      <button type="button" onClick={onSettings} aria-label="Chat parametrlari" className="icon-button"><MoreVertical size={20} /></button>
    </header>
  );
}
