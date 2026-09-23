"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "@/lib/chat/types";
import { playExclusive, releaseMedia } from "@/lib/media/playback";
import { createClient } from "@/lib/supabase/client";

export default function VoicePlayer({ attachment, waveform }: { attachment: Attachment; waveform?: number[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const refreshed = useRef(false);
  const resumeAt = useRef(0);
  const [src, setSrc] = useState(attachment.signedUrl ?? "");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(() => { if(typeof window==="undefined")return 1;const value=Number(localStorage.getItem("voice-playback-speed"));return [1,1.5,2].includes(value)?value:1; });
  const bars = useMemo(() => waveform?.length ? waveform.slice(0,40) : Array.from({length:32},(_,index)=>.2+((attachment.id.charCodeAt(index%attachment.id.length)*13+index*7)%65)/100),[attachment.id,waveform]);
  useEffect(() => () => { if(audioRef.current){audioRef.current.pause();releaseMedia(audioRef.current);} },[]);
  const duration = attachment.duration ?? 0;
  const shown = elapsed || duration;
  const label = `${Math.floor(shown/60)}:${String(Math.round(shown%60)).padStart(2,"0")}`;
  async function refreshUrl() { if(refreshed.current)return;refreshed.current=true;const {data}=await createClient().storage.from("chat-media").createSignedUrl(attachment.storage_path,3600);if(data?.signedUrl)setSrc(data.signedUrl); }
  return <div className="flex min-w-[230px] items-center gap-2 py-1" data-no-swipe data-no-longpress>
    <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={(event)=>{event.currentTarget.playbackRate=speed;if(resumeAt.current){event.currentTarget.currentTime=resumeAt.current;resumeAt.current=0;void playExclusive(event.currentTarget);}}} onTimeUpdate={(event)=>{setElapsed(event.currentTarget.currentTime);setProgress(event.currentTarget.duration?event.currentTarget.currentTime/event.currentTarget.duration:0);}} onPause={()=>setPlaying(false)} onPlay={()=>setPlaying(true)} onEnded={()=>{setPlaying(false);setProgress(0);setElapsed(0);}} onError={()=>{resumeAt.current=audioRef.current?.currentTime??0;void refreshUrl();}}/>
    <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-current/10" aria-label={playing?"Ovozli xabarni pauza qilish":"Ovozli xabarni eshitish"} onClick={()=>{const audio=audioRef.current;if(!audio)return;if(playing)audio.pause();else void playExclusive(audio).catch(()=>void refreshUrl());setPlaying(!playing);}}>{playing?<Pause size={18}/>:<Play size={18} fill="currentColor"/>}</button>
    <div className="min-w-0 flex-1"><div className="voice-player-wave relative flex h-8 items-center gap-[2px] overflow-hidden">
      {bars.map((value,index)=><i key={index} className={index/bars.length<=progress?"voice-bar-played":""} style={{height:`${Math.max(3,value*25)}px`}}/>)}
      <input type="range" min="0" max="1000" value={Math.round(progress*1000)} aria-label="Ovozli xabar bo'ylab surish" className="voice-seek absolute inset-0 h-full w-full" onChange={(event)=>{const audio=audioRef.current;if(!audio||!Number.isFinite(audio.duration))return;const next=Number(event.target.value)/1000;audio.currentTime=audio.duration*next;setProgress(next);}} />
    </div><span className="block text-[10px] opacity-70">{label}</span></div>
    <button type="button" className="grid h-11 min-w-11 place-items-center rounded-lg px-1.5 text-[10px] font-bold hover:bg-current/10" aria-label={`Ijro tezligi ${speed}x`} onClick={()=>{const next=speed===1?1.5:speed===1.5?2:1;setSpeed(next);try{localStorage.setItem("voice-playback-speed",String(next));}catch{}if(audioRef.current)audioRef.current.playbackRate=next;}}>{speed}x</button>
  </div>;
}
