"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Attachment } from "@/lib/chat/types";

let activeAudio: HTMLAudioElement | null = null;

export default function VoicePlayer({ attachment }: { attachment: Attachment }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  useEffect(() => () => audioRef.current?.pause(), []);
  const duration = attachment.duration ?? 0;
  const label = `${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, "0")}`;
  return (
    <div className="flex min-w-[210px] items-center gap-2 py-1">
      <audio ref={audioRef} src={attachment.signedUrl ?? ""} onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)} onEnded={() => setPlaying(false)} />
      <button className="grid h-10 w-10 place-items-center rounded-full bg-current/10" aria-label={playing ? "Pauza" : "Eshitish"} onClick={() => { const audio = audioRef.current; if (!audio) return; if (playing) audio.pause(); else { if (activeAudio && activeAudio !== audio) activeAudio.pause(); activeAudio = audio; void audio.play(); } setPlaying(!playing); }}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button>
      <div className="min-w-0 flex-1"><div className="h-1.5 overflow-hidden rounded-full bg-current/15"><div className="h-full rounded-full bg-current transition-[width]" style={{ width: `${progress * 100}%` }} /></div><span className="mt-1 block text-[10px] opacity-70">{label}</span></div>
      <button className="rounded-lg px-1.5 py-1 text-[10px] font-bold hover:bg-current/10" onClick={() => { const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1; setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next; }}>{speed}x</button>
    </div>
  );
}
