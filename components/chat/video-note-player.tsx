"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Attachment } from "@/lib/chat/types";
import { playExclusive, releaseMedia } from "@/lib/media/playback";
import { createClient } from "@/lib/supabase/client";

export default function VideoNotePlayer({ attachment }: { attachment: Attachment }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [src, setSrc] = useState(attachment.signedUrl ?? "");
  const refreshed = useRef(false);
  const frame = useRef(0);
  const radius = 91;
  useEffect(() => { if(!playing)return;const update=()=>{const video=ref.current;if(video?.duration)setProgress(video.currentTime/video.duration);frame.current=requestAnimationFrame(update);};frame.current=requestAnimationFrame(update);return()=>cancelAnimationFrame(frame.current); },[playing]);
  useEffect(() => () => { cancelAnimationFrame(frame.current);if (ref.current) { ref.current.pause(); releaseMedia(ref.current); } }, []);
  return <div className="relative h-48 w-48" data-no-swipe>
    <video ref={ref} src={src} playsInline preload="metadata" className="h-full w-full rounded-full bg-black object-cover"
      onTimeUpdate={(event) => setProgress(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration : 0)}
      onPause={()=>setPlaying(false)} onPlay={()=>setPlaying(true)}
      onError={() => { if(refreshed.current)return;refreshed.current=true;void createClient().storage.from("chat-media").createSignedUrl(attachment.storage_path,3600).then(({data})=>{if(data?.signedUrl)setSrc(data.signedUrl);}); }}
      onEnded={() => { setPlaying(false); setProgress(0); if (ref.current) ref.current.currentTime = 0; }} />
    <svg viewBox="0 0 192 192" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden="true"><circle cx="96" cy="96" r={radius} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="4" /><circle cx="96" cy="96" r={radius} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-progress} /></svg>
    <button type="button" className="absolute inset-0 m-auto grid h-12 w-12 place-items-center rounded-full bg-black/50 text-white backdrop-blur" aria-label={playing ? "Pauza" : "Ko'rish"} onClick={() => { const video=ref.current; if(!video)return; if(playing)video.pause();else void playExclusive(video);setPlaying(!playing); }}>{playing?<Pause size={21}/>:<Play size={21} fill="currentColor"/>}</button>
    <span className="absolute bottom-3 right-5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{Math.floor((attachment.duration??0)/60)}:{String(Math.round((attachment.duration??0)%60)).padStart(2,"0")}</span>
  </div>;
}
