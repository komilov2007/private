"use client";

import { Copy, Download, Reply, Share2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Message } from "@/lib/chat/types";
import { messagePreview } from "@/lib/chat/messages";

type Props = {
  message: Message;
  mine: boolean;
  senderName: string;
  onClose: () => void;
  onReply: () => void;
  onDelete: () => void;
  onNotice: (text: string) => void;
};

type Action = { id: "reply" | "copy" | "download" | "share" | "delete"; label: string; icon: typeof Reply; danger?: boolean; href?: string; download?: string };

const CLOSE_MS = 180;
const DRAG_CLOSE_PX = 90;

function extensionFor(mime: string | null | undefined, fallback: string) {
  const sub = mime?.split("/")[1]?.split(";")[0];
  return sub ? sub.replace("quicktime", "mov").replace("jpeg", "jpg") : fallback;
}

/** Can this browser share real files (not the private signed link) via the Web Share API? */
function canShareFiles(mime: string) {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([], "probe", { type: mime })] });
  } catch {
    return false;
  }
}

export default function MessageActionSheet({ message, mine, senderName, onClose, onReply, onDelete, onNotice }: Props) {
  const [closing, setClosing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  // Prefetched so navigator.share() still runs inside the tap gesture (Safari requirement).
  const sharedBlob = useRef<Blob | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  function close(after?: () => void) {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      onCloseRef.current();
      after?.();
    }, CLOSE_MS);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setClosing(true);
        closeTimer.current = setTimeout(() => onCloseRef.current(), CLOSE_MS);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const attachment = message.message_attachments?.[0];
  const isMedia = message.type === "image" || message.type === "video";
  const text = message.type === "text" ? message.content?.trim() ?? "" : "";
  // Share only via the Web Share API; media is shared as a file, never as the private signed URL.
  const shareText = typeof navigator !== "undefined" && Boolean(navigator.share) && Boolean(text);
  const shareMedia = isMedia && Boolean(attachment?.signedUrl) && canShareFiles(attachment?.mime_type ?? (message.type === "image" ? "image/jpeg" : "video/mp4"));
  const shareUrl = shareMedia ? attachment?.signedUrl ?? null : null;
  useEffect(() => {
    if (!shareUrl) return;
    let active = true;
    void fetch(shareUrl).then((response) => response.blob()).then((blob) => { if (active) sharedBlob.current = blob; }).catch(() => undefined);
    return () => { active = false; };
  }, [shareUrl]);

  const actions: Action[] = [{ id: "reply", label: "Javob berish", icon: Reply }];
  if (text) actions.push({ id: "copy", label: "Nusxalash", icon: Copy });
  if (isMedia && attachment?.signedUrl) actions.push({ id: "download", label: "Yuklab olish", icon: Download, href: attachment.signedUrl, download: attachment.file_name ?? "media" });
  if (shareText || shareMedia) actions.push({ id: "share", label: "Ulashish", icon: Share2 });
  if (mine) actions.push({ id: "delete", label: confirmDelete ? "Ha, o'chirish" : "O'chirish", icon: Trash2, danger: true });

  async function runAction(id: Action["id"]) {
    if (id === "reply") return close(onReply);
    if (id === "download") return close();
    if (id === "delete") return confirmDelete ? close(onDelete) : setConfirmDelete(true);
    if (id === "copy") {
      try {
        await navigator.clipboard.writeText(text);
        return close(() => onNotice("Nusxalandi"));
      } catch {
        return close(() => onNotice("Nusxalab bo'lmadi"));
      }
    }
    try {
      if (shareText) {
        await navigator.share({ text });
      } else if (attachment?.signedUrl) {
        const blob = sharedBlob.current ?? await (await fetch(attachment.signedUrl)).blob();
        const type = attachment.mime_type ?? blob.type;
        const name = attachment.file_name ?? `media.${extensionFor(type, message.type === "image" ? "jpg" : "mp4")}`;
        await navigator.share({ files: [new File([blob], name, { type })] });
      }
      close();
    } catch (error) {
      // AbortError = user dismissed the native share sheet; not an error.
      if (error instanceof DOMException && error.name === "AbortError") return close();
      close(() => onNotice("Ulashib bo'lmadi"));
    }
  }

  const media = message.type === "voice" ? "🎤 Ovozli xabar" : messagePreview(message);

  // Portal: the list is its own stacking context, so the composer would otherwise paint above the sheet.
  return createPortal(
    <div className="sheet-backdrop" data-closing={closing || undefined} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section
        className="bottom-sheet action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Xabar amallari"
        data-closing={closing || undefined}
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      >
        <div
          className="sheet-grabber"
          onPointerDown={(event) => { dragStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => { if (dragStart.current !== null) setDrag(Math.max(0, event.clientY - dragStart.current)); }}
          onPointerUp={() => {
            const moved = drag;
            dragStart.current = null;
            setDrag(0);
            if (moved > DRAG_CLOSE_PX) close();
          }}
          onPointerCancel={() => { dragStart.current = null; setDrag(0); }}
        >
          <span className="sheet-handle" aria-hidden="true" />
          <div className="action-preview">
            <p className="truncate text-xs font-semibold text-[var(--accent)]">{mine ? "Siz" : senderName}</p>
            <p className="muted line-clamp-2 text-sm">{media}</p>
          </div>
        </div>
        <ul className="action-list">
          {actions.map(({ id, label, icon: Icon, danger, href, download }) => (
            <li key={id}>
              {href ? (
                <a href={href} download={download} target="_blank" rel="noopener noreferrer" className="action-item" onClick={() => void runAction(id)}>
                  <Icon size={20} /> <span>{label}</span>
                </a>
              ) : (
                <button type="button" className="action-item" data-danger={danger || undefined} onClick={() => void runAction(id)}>
                  <Icon size={20} /> <span>{label}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>,
    document.body,
  );
}
