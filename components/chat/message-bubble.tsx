import { AlertCircle, Check, CheckCheck, Clock3, Download, MoreHorizontal, Reply, RotateCw, Trash2 } from "lucide-react";
import { useRef } from "react";
import Image from "next/image";
import type { Message, Profile } from "@/lib/chat/types";
import { STICKERS } from "@/lib/chat/constants";
import { timeLabel } from "@/lib/chat/helpers";
import { messagePreview } from "@/lib/chat/messages";
import MediaMessage from "./media-message";

type Props = {
  message: Message;
  mine: boolean;
  grouped: boolean;
  profiles: Record<string, Profile | null>;
  onReply: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onOpenMenu: () => void;
  selected: boolean;
  onOpenMedia: (viewer: { src: string; name: string; type: "image" | "video" }) => void;
};

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;
// Never start a long press on interactive children (voice play/speed, video controls, links, reply quote).
const INTERACTIVE = "button, a, audio, video, input, textarea, [data-no-longpress]";

export default function MessageBubble({ message, mine, grouped, profiles, onReply, onDelete, onRetry, onOpenMedia, onOpenMenu, selected }: Props) {
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);

  function cancelPress() {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }

  if (message.type === "system") {
    return (
      <div className="my-4 flex justify-center" role="note">
        <p className="system-pill">{message.content}</p>
      </div>
    );
  }

  const read = message.message_reads?.some((item) => item.user_id !== message.sender_id);
  const sticker = message.type === "sticker" ? STICKERS.find((item) => item.id === message.content) : undefined;
  const replySender = message.reply_to ? profiles[message.reply_to.sender_id]?.display_name ?? "" : "";
  const attachment = message.message_attachments?.[0];
  const isSticker = message.type === "sticker" && !message.deleted_at;
  const failed = message.pending === "failed";
  const menuEnabled = !message.deleted_at && !message.pending;

  const trigger = menuEnabled ? (
    <button type="button" onClick={onOpenMenu} aria-label="Xabar amallari" aria-haspopup="dialog" className="message-menu-trigger" data-selected={selected || undefined}>
      <span><MoreHorizontal size={16} /></span>
    </button>
  ) : null;

  return (
    <article className={`message-enter group flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-3"}`} data-selected={selected || undefined}>
      <div className={`flex max-w-[82%] flex-col ${mine ? "items-end" : "items-start"}`}>
        <div className={`flex items-start ${mine ? "flex-row" : "flex-row-reverse"}`}>
        {trigger}
        <div
          className={`bubble ${mine ? "bubble-mine" : "bubble-theirs"} ${grouped ? "bubble-grouped" : ""} ${isSticker ? "bubble-sticker" : ""} ${failed ? "opacity-80" : ""}`}
          onPointerDown={(event) => {
            if (!menuEnabled || event.pointerType !== "touch" || (event.target as HTMLElement).closest(INTERACTIVE)) return;
            const { clientX: x, clientY: y } = event;
            cancelPress();
            press.current = {
              x, y,
              timer: setTimeout(() => {
                press.current = null;
                if (window.getSelection()?.toString()) return;
                navigator.vibrate?.(12);
                onOpenMenu();
              }, LONG_PRESS_MS),
            };
          }}
          onPointerMove={(event) => {
            // Scrolling or dragging cancels the long press.
            if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > MOVE_TOLERANCE_PX) cancelPress();
          }}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onPointerLeave={cancelPress}
          onContextMenu={(event) => { if (menuEnabled && !(event.target as HTMLElement).closest(INTERACTIVE) && window.matchMedia("(hover: none)").matches) event.preventDefault(); }}
        >
          {message.deleted_at ? (
            <p className="px-1 py-0.5 text-sm italic opacity-75">Xabar o&apos;chirildi</p>
          ) : (
            <>
              {message.reply_to ? (
                <button
                  type="button"
                  onClick={() => document.getElementById(`message-${message.reply_to_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className="reply-quote"
                >
                  <span className="block truncate font-semibold">{replySender}</span>
                  <span className="line-clamp-2 opacity-85">{messagePreview(message.reply_to)}</span>
                </button>
              ) : null}
              {message.type === "text" ? <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.35rem]">{message.content}</p> : null}
              {sticker ? <Image src={sticker.src} alt={sticker.label} width={112} height={112} className="h-28 w-28" /> : null}
              {message.type === "image" || message.type === "video" || message.type === "voice" ? <MediaMessage message={message} onOpenMedia={onOpenMedia} /> : null}
            </>
          )}
          <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10.5px] ${isSticker ? "rounded-full bg-black/25 px-1.5 text-white" : "opacity-70"}`}>
            <span>{timeLabel(message.created_at)}</span>
            {mine && !message.deleted_at ? (
              message.pending === "sending" ? <Clock3 size={12} aria-label="Yuborilmoqda" />
                : failed ? <AlertCircle size={12} aria-label="Yuborilmadi" />
                  : read ? <CheckCheck size={14} aria-label="O'qildi" /> : <Check size={13} aria-label="Yuborildi" />
            ) : null}
          </div>
        </div>
        </div>
        {failed ? (
          <button type="button" onClick={onRetry} className="mt-1 flex items-center gap-1 text-xs font-semibold text-[var(--danger)]"><RotateCw size={12} /> Yuborilmadi · qayta urinish</button>
        ) : !message.deleted_at && !message.pending ? (
          <div className={`message-actions ${mine ? "justify-end" : "justify-start"}`}>
            <button type="button" aria-label="Javob berish" onClick={onReply} className="icon-button h-8 w-8"><Reply size={15} /></button>
            {attachment?.signedUrl && message.type !== "voice" ? (
              <a aria-label="Yuklab olish" href={attachment.signedUrl} download={attachment.file_name ?? "media"} className="icon-button h-8 w-8"><Download size={15} /></a>
            ) : null}
            {mine ? <button type="button" aria-label="O'chirish" onClick={onDelete} className="icon-button h-8 w-8"><Trash2 size={15} /></button> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
