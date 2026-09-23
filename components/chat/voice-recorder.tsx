"use client";

import { Mic, Pause, Play, Send, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pauseActiveMedia, playExclusive } from "@/lib/media/playback";
import { NATIVE_PAUSE_EVENT, permissionDeniedMessage } from "@/lib/native/platform";

export type VoiceDraft = { blob: Blob; duration: number; mimeType: string; url: string; waveform: number[] };
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const MIN_MS = 700;
type Props = { locked: boolean; releaseToken: number; onCancel: () => void; onSend: (draft: VoiceDraft) => Promise<void> };

export default function VoiceRecorder({ locked, releaseToken, onCancel, onSend }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const samplesRef = useRef<number[]>([]);
  const autoSendRef = useRef(false);
  const handledRelease = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const draftUrlRef = useRef("");
  const [seconds, setSeconds] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array(28).fill(.12));
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [canPause, setCanPause] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let frame = 0;
    let cancelled = false;
    let context: AudioContext | null = null;
    pauseActiveMedia();
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) { const unsupported=window.setTimeout(()=>setError("Ovoz yozishni boshlab bo'lmadi."),0);return()=>clearTimeout(unsupported); }
    void navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (cancelled) return stream.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      const preferred = TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      setCanPause(typeof recorder.pause === "function" && typeof recorder.resume === "function");
      recorderRef.current = recorder; chunksRef.current = []; samplesRef.current = []; startedRef.current = Date.now();
      try {
        context = new AudioContext(); const analyser = context.createAnalyser(); analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser); const values = new Uint8Array(analyser.frequencyBinCount);
        const read = () => { analyser.getByteTimeDomainData(values);let total=0;for(const value of values)total+=Math.abs(value-128);const level=Math.max(.08,Math.min(1,total/values.length/32));samplesRef.current.push(level);setWaveform((current)=>[...current.slice(-27),level]);frame=requestAnimationFrame(read); };
        frame=requestAnimationFrame(read);
      } catch { /* Recording remains available without visualization. */ }
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (timer) clearInterval(timer); cancelAnimationFrame(frame); void context?.close();
        const elapsed = Date.now() - startedRef.current; stream.getTracks().forEach((track) => track.stop()); streamRef.current = null;
        if (elapsed < MIN_MS || !chunksRef.current.length) { onCancel(); return; }
        const duration = Math.max(1, Math.round(elapsed / 1000)); const mimeType = (recorder.mimeType || preferred || "audio/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type: mimeType }); const raw = samplesRef.current;
        const compact = Array.from({length:32},(_,index)=>raw.length ? raw[Math.min(raw.length-1,Math.floor(index*raw.length/32))] : .12);
        const next = { blob, duration, mimeType, url: URL.createObjectURL(blob), waveform: compact }; draftUrlRef.current = next.url;
        setDraft(next); setSeconds(duration); setWaveform(compact); if (autoSendRef.current) void onSend(next);
      };
      recorder.start(200); if(autoSendRef.current)queueMicrotask(()=>recorder.state==="recording"&&recorder.stop()); timer = setInterval(() => setSeconds(Math.floor((Date.now()-startedRef.current)/1000)),250);
    }).catch(() => setError(permissionDeniedMessage("microphone")));
    return () => { cancelled=true;if(timer)clearInterval(timer);cancelAnimationFrame(frame);if(recorderRef.current?.state==="recording"||recorderRef.current?.state==="paused")recorderRef.current.stop();streamRef.current?.getTracks().forEach((track)=>track.stop());if(draftUrlRef.current)URL.revokeObjectURL(draftUrlRef.current);void context?.close(); };
  // One capture session per mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android app backgrounded: never keep the mic open or auto-send. Stop into a reviewable draft.
  useEffect(() => { const onPause=()=>{autoSendRef.current=false;const recorder=recorderRef.current;if(recorder?.state==="recording"||recorder?.state==="paused")recorder.stop();};window.addEventListener(NATIVE_PAUSE_EVENT,onPause);return()=>window.removeEventListener(NATIVE_PAUSE_EVENT,onPause); },[]);
  useEffect(() => { if(releaseToken>handledRelease.current){handledRelease.current=releaseToken;autoSendRef.current=true;const recorder=recorderRef.current;if(recorder?.state==="recording"||recorder?.state==="paused")recorder.stop();} },[releaseToken]);
  const time = `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  return <section className="recording-panel mx-3 mb-2" aria-label="Ovoz yozish">
    {error?<div className="flex items-center justify-between text-sm text-[var(--danger)]"><span>{error}</span><button type="button" onClick={onCancel}>Yopish</button></div>:<div className="flex items-center gap-2">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${draft?"bg-[var(--accent-soft)] text-[var(--accent)]":"bg-red-500 text-white"}`}><Mic size={19}/></span>
      <span className="w-12 shrink-0 font-mono text-xs font-semibold">{time}</span>
      <div className="voice-waveform flex h-10 min-w-0 flex-1 items-center gap-[2px]" aria-label="Ovoz to'lqini">{waveform.map((value,index)=><i key={index} style={{height:`${Math.max(3,value*28)}px`}}/>)}</div>
      {draft?<><audio ref={audioRef} src={draft.url} onEnded={()=>setPlaying(false)}/><button type="button" className="icon-button" aria-label={playing?"Pauza":"Eshitish"} onClick={()=>{const audio=audioRef.current;if(!audio)return;if(playing)audio.pause();else void playExclusive(audio);setPlaying(!playing);}}>{playing?<Pause size={19}/>:<Play size={19}/>}</button><button type="button" className="icon-button text-[var(--danger)]" aria-label="Yozuvni o'chirish" onClick={onCancel}><Trash2 size={19}/></button><button type="button" className="icon-button bg-[var(--accent)] text-white" aria-label="Ovozli xabarni yuborish" onClick={()=>void onSend(draft)}><Send size={18}/></button></>:locked?<>{canPause?<button type="button" className="icon-button" aria-label={paused?"Yozishni davom ettirish":"Yozishni pauza qilish"} onClick={()=>{const recorder=recorderRef.current;if(!recorder)return;if(paused)recorder.resume();else recorder.pause();setPaused(!paused);}}>{paused?<Play size={18}/>:<Pause size={18}/>}</button>:null}<button type="button" className="icon-button text-[var(--danger)]" aria-label="Yozuvni bekor qilish" onClick={onCancel}><Trash2 size={19}/></button><button type="button" className="icon-button bg-[var(--accent)] text-white" aria-label="Yozishni to'xtatish" onClick={()=>{autoSendRef.current=false;const recorder=recorderRef.current;if(recorder?.state==="recording"||recorder?.state==="paused")recorder.stop();}}><Square size={17} fill="currentColor"/></button></>:<span className="muted shrink-0 text-xs">Yozilmoqda</span>}
    </div>}
  </section>;
}
