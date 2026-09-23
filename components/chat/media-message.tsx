import { ImageOff } from "lucide-react";
import type { Message } from "@/lib/chat/types";
import VoicePlayer from "./voice-player";
import VideoNotePlayer from "./video-note-player";

type Props = {
  message: Message;
  onOpenMedia: (viewer: { src: string; name: string; type: "image" | "video" }) => void;
};

export default function MediaMessage({ message, onOpenMedia }: Props) {
  const attachment = message.message_attachments?.[0];

  // Realtime rows render before enrichment; show a placeholder until the attachment arrives.
  if (!attachment) {
    if (message.type === "video_note") return <div className="skeleton h-48 w-48 rounded-full" aria-label="Yuklanmoqda" />;
    return message.type === "voice"
      ? <div className="flex min-w-[210px] items-center gap-2 py-1"><span className="skeleton h-10 w-10 rounded-full" /><span className="skeleton h-1.5 flex-1 rounded-full" /></div>
      : <div className="skeleton h-44 w-56 max-w-full rounded-2xl" aria-label="Yuklanmoqda" />;
  }
  if (!attachment.signedUrl) {
    return <div className="flex items-center gap-2 rounded-2xl bg-black/5 px-4 py-6 text-sm opacity-80"><ImageOff size={16} /> Fayl yuklanmadi</div>;
  }
  const name = attachment.file_name ?? "media";
  if (message.type === "voice") {
    let waveform: number[] | undefined;
    try { const parsed=JSON.parse(message.content??"{}");if(Array.isArray(parsed.waveform))waveform=parsed.waveform.filter((value:unknown)=>typeof value==="number").slice(0,40); } catch { /* Older voice messages have no waveform metadata. */ }
    return <VoicePlayer attachment={attachment} waveform={waveform} />;
  }
  if (message.type === "video_note") return <VideoNotePlayer attachment={attachment} />;
  if (message.type === "image") {
    return (
      <button type="button" className="-mx-1 -mt-0.5 block overflow-hidden rounded-[14px]" onClick={() => onOpenMedia({ src: attachment.signedUrl!, name, type: "image" })}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
        <img src={attachment.signedUrl} alt={name} className="max-h-80 w-full object-cover" loading="lazy" />
      </button>
    );
  }
  return <video className="-mx-1 -mt-0.5 max-h-80 w-full rounded-[14px] bg-black" src={attachment.signedUrl} controls playsInline preload="metadata" />;
}
