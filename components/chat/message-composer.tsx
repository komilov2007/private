"use client";

import { Camera, CircleUserRound, ImageIcon, Laugh, Loader2, Mic, Plus, Send, Sticker, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHAT_BUCKET, IMAGE_TYPES, MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, VIDEO_TYPES } from "@/lib/chat/constants";
import { safeFileName } from "@/lib/chat/helpers";
import type { Message, Profile } from "@/lib/chat/types";
import { logSupabaseError } from "@/lib/supabase/errors";
import EmojiPicker from "./emoji-picker";
import StickerPicker from "./sticker-picker";
import ReplyPreview from "./reply-preview";
import VoiceRecorder, { type VoiceDraft } from "./voice-recorder";
import VideoNoteRecorder, { type VideoNoteDraft } from "./video-note-recorder";
import { useRecordingGesture } from "@/lib/media/use-recording-gesture";
import { useCalls } from "@/components/calls/call-provider";

export type OutgoingMessage = { type: "text" | "sticker"; content: string; replyTo: Message | null };

type Props = {
  userId: string;
  conversationId: string;
  replyTo: Message | null;
  profiles: Record<string, Profile | null>;
  onCancelReply: () => void;
  onTyping: (active: boolean) => void;
  /** Optimistic text/sticker send handled by the chat shell. */
  onSend: (message: OutgoingMessage) => Promise<boolean>;
  /** Media/voice messages after upload + insert. */
  onSent: (message: Message | null) => void;
};

export default function MessageComposer({ userId, conversationId, replyTo, profiles, onCancelReply, onTyping, onSend, onSent }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [text, setText] = useState("");
  const hasText = Boolean(text.trim());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"none" | "emoji" | "stickers" | "attach">("none");
  const [recording, setRecording] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [recordingLocked, setRecordingLocked] = useState(false);
  const [releaseToken, setReleaseToken] = useState(0);
  const [recordMode, setRecordMode] = useState<"voice" | "video">(() => { if(typeof window==="undefined")return "voice";try{return localStorage.getItem("composer-record-mode")==="video"?"video":"voice";}catch{return "voice";} });
  const { activeCall } = useCalls();

  useEffect(() => { if(!activeCall)return;const timer=window.setTimeout(()=>{setRecording(false);setVideoRecording(false);setRecordingLocked(false);},0);return()=>clearTimeout(timer); }, [activeCall]);

  function closeRecorder() { setRecording(false); setVideoRecording(false); setRecordingLocked(false); }
  const recordingGesture = useRecordingGesture({
    disabled: uploading || Boolean(activeCall) || hasText,
    onTap: () => { const next=recordMode==="voice"?"video":"voice";setRecordMode(next);try{localStorage.setItem("composer-record-mode",next);}catch{} },
    onStart: () => { setPanel("none");setRecordingLocked(false);if(recordMode==="voice")setRecording(true);else setVideoRecording(true); },
    onRelease: () => setReleaseToken((value)=>value+1),
    onCancel: closeRecorder,
    onLock: () => setRecordingLocked(true),
  });

  function stopTyping() {
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    onTyping(false);
  }

  function scheduleTyping() {
    onTyping(true);
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(() => onTyping(false), 2000);
  }

  function sendText() {
    const content = text.trim();
    if (!content || !conversationId) return;
    setError("");
    setText("");
    stopTyping();
    setPanel("none");
    textRef.current?.focus();
    void onSend({ type: "text", content, replyTo });
  }

  function sendSticker(id: string) {
    if (!conversationId) return;
    setPanel("none");
    void onSend({ type: "sticker", content: id, replyTo });
  }

  async function sendFile(file: File) {
    const isImage = IMAGE_TYPES.includes(file.type);
    const isVideo = VIDEO_TYPES.includes(file.type);
    if (!isImage && !isVideo) return setError("Faqat rasm yoki video yuborish mumkin");
    if ((isImage && file.size > MAX_IMAGE_SIZE) || (isVideo && file.size > MAX_VIDEO_SIZE)) return setError("Fayl juda katta");
    setUploading(true);
    setError("");
    const path = `${conversationId}/${userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const upload = await supabase.storage.from(CHAT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) {
      console.error("[chat] upload media", { message: upload.error.message });
      setUploading(false);
      return setError("Fayl yuklanmadi");
    }
    const { data: message, error: messageError } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, type: isImage ? "image" : "video", reply_to_id: replyTo?.id ?? null }).select("*").single();
    if (messageError || !message) {
      logSupabaseError("[chat] insert media message", messageError);
      await supabase.storage.from(CHAT_BUCKET).remove([path]);
      setUploading(false);
      return setError("Xabar yuborilmadi");
    }
    const attachment = await supabase.from("message_attachments").insert({ message_id: message.id, storage_path: path, file_name: file.name, mime_type: file.type, file_size: file.size });
    if (attachment.error) logSupabaseError("[chat] insert attachment", attachment.error);
    setUploading(false);
    onSent(message as Message);
  }

  async function sendVoice(draft: VoiceDraft) {
    if (!conversationId) return;
    setUploading(true);
    const extension = draft.mimeType.includes("mp4") ? "m4a" : draft.mimeType.includes("ogg") ? "ogg" : "webm";
    const path = `${conversationId}/${userId}/${crypto.randomUUID()}-voice.${extension}`;
    const upload = await supabase.storage.from(CHAT_BUCKET).upload(path, draft.blob, { contentType: draft.mimeType });
    if (upload.error) {
      console.error("[chat] upload voice", { message: upload.error.message });
      setUploading(false);
      return setError("Ovozli xabar yuklanmadi");
    }
    const { data: message, error: messageError } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, type: "voice", content: JSON.stringify({ waveform: draft.waveform.map((value)=>Math.round(value*100)/100) }), reply_to_id: replyTo?.id ?? null }).select("*").single();
    if (messageError || !message) {
      logSupabaseError("[chat] insert voice message", messageError);
      await supabase.storage.from(CHAT_BUCKET).remove([path]);
      setUploading(false);
      return setError("Xabar yuborilmadi");
    }
    const attachment = await supabase.from("message_attachments").insert({ message_id: message.id, storage_path: path, file_name: "Ovozli xabar", mime_type: draft.mimeType, file_size: draft.blob.size, duration: draft.duration });
    setUploading(false);
    if (attachment.error) {
      logSupabaseError("[chat] insert voice attachment", attachment.error);
      await Promise.all([supabase.storage.from(CHAT_BUCKET).remove([path]),supabase.from("messages").update({deleted_at:new Date().toISOString()}).eq("id",message.id)]);
      return setError("Ovozli xabar saqlanmadi");
    }
    closeRecorder();
    onSent(message as Message);
  }

  async function sendVideoNote(draft: VideoNoteDraft) {
    if (!conversationId) return;
    setUploading(true); setError("");
    const extension = draft.mimeType.includes("mp4") ? "mp4" : "webm";
    const path = `${conversationId}/${userId}/video-notes/${crypto.randomUUID()}.${extension}`;
    const upload = await supabase.storage.from(CHAT_BUCKET).upload(path, draft.blob, { contentType: draft.mimeType, upsert: false });
    if (upload.error) { console.error("[chat] upload video note", { message: upload.error.message }); setUploading(false); return setError("Video xabarni yuborib bo'lmadi"); }
    const { data: message, error: messageError } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, type: "video_note", reply_to_id: replyTo?.id ?? null }).select("*").single();
    if (messageError || !message) {
      logSupabaseError("[chat] insert video note", messageError); await supabase.storage.from(CHAT_BUCKET).remove([path]); setUploading(false); return setError("Video xabarni yuborib bo'lmadi");
    }
    const attachment = await supabase.from("message_attachments").insert({ message_id: message.id, storage_path: path, file_name: "Video xabar", mime_type: draft.mimeType, file_size: draft.blob.size, duration: draft.duration });
    setUploading(false);
    if (attachment.error) { logSupabaseError("[chat] insert video note attachment", attachment.error); await Promise.all([supabase.storage.from(CHAT_BUCKET).remove([path]),supabase.from("messages").update({deleted_at:new Date().toISOString()}).eq("id",message.id)]); return setError("Video xabarni saqlab bo'lmadi"); }
    closeRecorder(); onSent(message as Message);
  }

  return (
    <footer className="composer relative z-20 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
      {replyTo ? <ReplyPreview message={replyTo} profile={profiles[replyTo.sender_id] ?? null} onCancel={onCancelReply} /> : null}
      {recording ? <VoiceRecorder locked={recordingLocked} releaseToken={releaseToken} onCancel={closeRecorder} onSend={sendVoice} /> : null}
      {videoRecording ? <VideoNoteRecorder locked={recordingLocked} releaseToken={releaseToken} onCancel={closeRecorder} onSend={sendVideoNote} /> : null}
      {recordingGesture.progress.active && !recordingLocked ? <div className="recording-gesture-hint"><span style={{opacity:.45+.55*recordingGesture.progress.cancel}}>Bekor qilish uchun suring</span><span style={{opacity:.45+.55*recordingGesture.progress.lock}}>Qulflash uchun yuqoriga</span></div> : null}
      {error ? (
        <p className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-[var(--danger)]">
          <span>{error}. Qayta urinib ko&apos;ring.</span>
          <button type="button" aria-label="Yopish" onClick={() => setError("")}><X size={15} /></button>
        </p>
      ) : null}
      {panel === "emoji" ? <div className="mx-3 mb-2"><EmojiPicker onPick={(emoji) => { setText((value) => value + emoji); textRef.current?.focus(); }} /></div> : null}
      {panel === "stickers" ? <div className="mx-3 mb-2"><StickerPicker onPick={sendSticker} /></div> : null}
      {panel === "attach" ? (
        <div className="mx-3 mb-2 grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-2 shadow-[var(--shadow)]">
          {([[ImageIcon, "Rasm / video", "file"], [Camera, "Kamera", "camera"], [Sticker, "Stikerlar", "stickers"]] as const).map(([Icon, label, action]) => (
            <button key={label} type="button" onClick={() => {
              if (action === "stickers") return setPanel("stickers");
              setPanel("none");
              (action === "file" ? fileRef : cameraRef).current?.click();
            }} className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-2.5 text-[11px] font-semibold transition hover:bg-[var(--accent-soft)]">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><Icon size={20} /></span>{label}
            </button>
          ))}
        </div>
      ) : null}
      <input ref={fileRef} type="file" accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendFile(file); event.currentTarget.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendFile(file); event.currentTarget.value = ""; }} />
      <div className="mx-2 flex items-end gap-1.5">
        <button type="button" onClick={() => setPanel((value) => (value === "attach" || value === "stickers" ? "none" : "attach"))} aria-label="Biriktirish" aria-expanded={panel === "attach"} className="icon-button">
          {uploading ? <Loader2 size={21} className="animate-spin" /> : <Plus size={23} className={`transition ${panel === "attach" || panel === "stickers" ? "rotate-45" : ""}`} />}
        </button>
        <div className="composer-field flex min-w-0 flex-1 items-end pl-4 pr-1">
          <textarea
            ref={textRef}
            value={text}
            onChange={(event) => { setText(event.target.value); scheduleTyping(); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)) {
                event.preventDefault();
                sendText();
              }
            }}
            onFocus={() => setPanel((value) => (value === "emoji" ? value : "none"))}
            rows={1}
            placeholder="Xabar"
            aria-label="Xabar matni"
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 outline-none placeholder:text-[var(--muted)]"
          />
          <button type="button" onClick={() => setPanel((value) => (value === "emoji" ? "none" : "emoji"))} aria-label="Emoji" aria-expanded={panel === "emoji"} className="icon-button h-10 w-10"><Laugh size={20} /></button>
        </div>
        <button
          type="button"
          disabled={(uploading && !hasText) || Boolean(activeCall)}
          onClick={hasText ? sendText : undefined}
          {...(!hasText ? recordingGesture.handlers : {})}
          aria-label={hasText ? "Yuborish" : activeCall ? "Qo'ng'iroq vaqtida yozib bo'lmaydi" : recordMode === "voice" ? "Ovoz yozish uchun bosib turing, video xabar uchun bosing" : "Video xabar yozish uchun bosib turing, ovoz uchun bosing"}
          className="send-button"
        >
          {hasText ? <Send size={19} /> : recordMode === "voice" ? <Mic size={20} /> : <CircleUserRound size={20} />}
        </button>
      </div>
      {uploading ? <p className="muted mt-1 flex items-center justify-center gap-1.5 text-[11px]"><Video size={12} /> Yuklanmoqda…</p> : null}
    </footer>
  );
}
