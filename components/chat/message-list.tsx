"use client";

import { ArrowDown, Loader2, MessageCircle, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Message, Profile } from "@/lib/chat/types";
import { dateLabel, shouldGroup } from "@/lib/chat/helpers";
import MessageBubble from "./message-bubble";
import DateSeparator from "./date-separator";
import MessageActionSheet from "./message-action-sheet";

type Props = {
  userId: string;
  me: Profile | null;
  other: Profile | null;
  otherName: string;
  messages: Message[];
  loading: boolean;
  loadError: boolean;
  onRetryLoad: () => void;
  olderLoading: boolean;
  hasOlder: boolean;
  onLoadOlder: () => Promise<void>;
  onNavigateReply: (messageId: string) => Promise<void>;
  onReply: (message: Message) => void;
  onDelete: (message: Message) => void;
  selectedIds: Set<string>;
  onSelect: (message: Message) => void;
  onRetry: (message: Message) => void;
  onNotice: (text: string) => void;
  onOpenMedia: (viewer: { src: string; name: string; type: "image" | "video" }) => void;
};

export default function MessageList({ userId, me, other, otherName, messages, loading, loadError, onRetryLoad, olderLoading, hasOlder, onLoadOlder, onNavigateReply, onReply, onDelete, selectedIds, onSelect, onRetry, onNotice, onOpenMedia }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const previousLast = useRef<string | undefined>(undefined);
  const previousCount = useRef(0);
  const nearBottomRef = useRef(true);
  const [newCount, setNewCount] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const selectionMode = selectedIds.size > 0;
  const menuMessage = menuId ? messages.find((message) => message.id === menuId && !message.deleted_at && !message.pending) ?? null : null;
  const profiles: Record<string, Profile | null> = {
    ...(me ? { [me.id]: me } : {}),
    ...(other ? { [other.id]: { ...other, display_name: otherName } } : {}),
  };

  // Stick to bottom for new messages (not for older pages prepended at the top).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const last = messages.at(-1);
    const appended = last?.id !== previousLast.current;
    const first = previousCount.current === 0;
    if (appended && (first || nearBottomRef.current || last?.sender_id === userId)) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    } else if (appended && last) {
      requestAnimationFrame(() => setNewCount((count) => count + 1));
    }
    previousLast.current = last?.id;
    previousCount.current = messages.length;
  }, [messages, userId]);

  async function loadOlderAnchored() {
    const el = ref.current;
    if (!el || olderLoading || !hasOlder) return;
    const oldHeight = el.scrollHeight;
    const oldTop = el.scrollTop;
    await onLoadOlder();
    requestAnimationFrame(() => {
      if (ref.current) ref.current.scrollTop = oldTop + ref.current.scrollHeight - oldHeight;
    });
  }

  async function navigateReply(messageId: string) {
    if (!document.getElementById(`message-${messageId}`)) await onNavigateReply(messageId);
    requestAnimationFrame(() => {
      const target = document.getElementById(`message-${messageId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("message-highlight");
      window.setTimeout(() => target?.classList.remove("message-highlight"), 1400);
    });
  }

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottomRef.current = near;
    if (near && newCount) setNewCount(0);
    if (el.scrollTop < 120 && hasOlder && !olderLoading) void loadOlderAnchored();
  }

  return (
    <section ref={ref} onScroll={onScroll} className="chat-scrollbar relative z-10 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5" aria-live="polite">
      {loading && !messages.length ? (
        <div className="space-y-3 pt-4" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, index) => <div key={index} className={`skeleton h-11 rounded-2xl ${index % 2 ? "ml-auto w-[58%]" : "w-[68%]"}`} />)}
        </div>
      ) : loadError && !messages.length ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
          <p className="font-semibold">Xabarlarni yuklab bo&apos;lmadi</p>
          <button type="button" onClick={onRetryLoad} className="primary-button"><RotateCw size={16} /> Qayta urinish</button>
        </div>
      ) : (
        <>
          {olderLoading ? <div className="mb-3 flex justify-center text-[var(--accent)]"><Loader2 className="animate-spin" size={20} /></div> : null}
          {!messages.length ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><MessageCircle /></span>
              <p className="font-semibold">Suhbatni boshlang</p>
              <p className="muted mt-1 text-sm">{otherName}ga birinchi xabarni yuboring</p>
            </div>
          ) : null}
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const showDate = !previous || dateLabel(previous.created_at) !== dateLabel(message.created_at);
            const grouped = !showDate && previous?.type !== "system" && shouldGroup(previous?.sender_id, message.sender_id, previous?.created_at, message.created_at);
            return (
              <div key={message.id} id={`message-${message.id}`}>
                {showDate ? <DateSeparator label={dateLabel(message.created_at)} /> : null}
                <MessageBubble
                  message={message}
                  mine={message.sender_id === userId}
                  grouped={grouped}
                  profiles={profiles}
                  onReply={() => onReply(message)}
                  onNavigateReply={(id) => void navigateReply(id)}
                  onDelete={() => onDelete(message)}
                  onRetry={() => onRetry(message)}
                  onOpenMenu={() => setMenuId(message.id)}
                  onSelect={() => onSelect(message)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(message.id)}
                  onOpenMedia={onOpenMedia}
                />
              </div>
            );
          })}
          {newCount ? (
            <button type="button" onClick={() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" }); setNewCount(0); }} className="sticky bottom-2 mx-auto flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white shadow-lg">
              <ArrowDown size={15} /> {newCount} ta yangi xabar
            </button>
          ) : null}
        </>
      )}
      {menuMessage ? (
        <MessageActionSheet
          key={menuMessage.id}
          message={menuMessage}
          mine={menuMessage.sender_id === userId}
          senderName={profiles[menuMessage.sender_id]?.display_name ?? otherName}
          onClose={() => setMenuId(null)}
          onReply={() => onReply(menuMessage)}
          onDelete={() => onDelete(menuMessage)}
          onSelect={() => onSelect(menuMessage)}
          onNotice={onNotice}
        />
      ) : null}
    </section>
  );
}
