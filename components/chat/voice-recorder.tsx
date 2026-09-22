"use client";

import { Mic, Pause, Play, Send, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type VoiceDraft = { blob: Blob; duration: number; mimeType: string; url: string };

// Safari/iOS records audio/mp4; Chrome/Android/Firefox record webm/ogg opus.
const CANDIDATE_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export default function VoiceRecorder({ onCancel, onSend }: { onCancel: () => void; onSend: (draft: VoiceDraft) => Promise<void> }) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    void navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      // StrictMode/unmount before permission resolved: release the microphone immediately.
      if (cancelled) return stream.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      const preferred = CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedRef.current = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (timer) clearInterval(timer);
        const duration = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        const mimeType = (recorder.mimeType || preferred || "audio/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setDraft({ blob, duration, mimeType, url: URL.createObjectURL(blob) });
        setSeconds(duration);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(250);
      timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 500);
    }).catch(() => setError("Mikrofonga ruxsat berilmadi"));
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="mx-3 mb-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-3 shadow-[var(--shadow)]">
      {error ? <div className="flex items-center justify-between text-sm text-[var(--danger)]"><span>{error}</span><button onClick={onCancel}>Yopish</button></div> : (
        <div className="flex items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-full ${draft ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "animate-pulse bg-red-500 text-white"}`}><Mic size={19} /></span>
          <span className="w-12 font-mono text-sm font-semibold">{time}</span>
          <div className="flex h-8 min-w-0 flex-1 items-center gap-1 overflow-hidden" aria-label="Ovoz to'lqini">
            {Array.from({ length: 22 }).map((_, i) => <i key={i} className="w-1 rounded-full bg-[var(--accent)] opacity-70" style={{ height: `${8 + ((i * 11) % 20)}px` }} />)}
          </div>
          {draft ? <>
            <audio ref={audioRef} src={draft.url} onEnded={() => setPlaying(false)} />
            <button className="icon-button" aria-label={playing ? "Pauza" : "Eshitish"} onClick={() => { if (!audioRef.current) return; if (playing) audioRef.current.pause(); else void audioRef.current.play(); setPlaying(!playing); }}>{playing ? <Pause size={19} /> : <Play size={19} />}</button>
            <button className="icon-button text-[var(--danger)]" aria-label="Bekor qilish" onClick={onCancel}><Trash2 size={19} /></button>
            <button className="icon-button bg-[var(--accent)] text-white" aria-label="Yuborish" onClick={() => void onSend(draft)}><Send size={18} /></button>
          </> : <>
            <button className="icon-button text-[var(--danger)]" aria-label="Bekor qilish" onClick={onCancel}><Trash2 size={19} /></button>
            <button className="icon-button bg-[var(--accent)] text-white" aria-label="Yozishni to'xtatish" onClick={() => recorderRef.current?.stop()}><Square size={17} fill="currentColor" /></button>
          </>}
        </div>
      )}
    </div>
  );
}
