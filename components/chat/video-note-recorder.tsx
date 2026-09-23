"use client";

import { Camera, CameraIcon, Play, RotateCcw, Send, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { pauseActiveMedia } from "@/lib/media/playback";
import { NATIVE_PAUSE_EVENT, permissionDeniedMessage } from "@/lib/native/platform";

export type VideoNoteDraft = { blob: Blob; duration: number; mimeType: string; url: string };
const TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
const LIMIT_SECONDS = 60;

export default function VideoNoteRecorder({ locked, releaseToken, onCancel, onSend }: { locked: boolean; releaseToken: number; onCancel: () => void; onSend: (draft: VideoNoteDraft) => Promise<void> }) {
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [draft, setDraft] = useState<VideoNoteDraft | null>(null);
  const [error, setError] = useState("");
  const autoSendRef = useRef(false);
  const handledRelease = useRef(0);
  const draftUrlRef = useRef("");

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const openCamera = useCallback(async (mode: "user" | "environment") => {
    stopTracks();
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Bu brauzer video xabar yozishni qo'llamaydi.");
      return;
    }
    try {
      pauseActiveMedia();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: { ideal: mode }, width: { ideal: 720 }, height: { ideal: 720 } } });
      streamRef.current = stream;
      if (previewRef.current) { previewRef.current.srcObject = stream; await previewRef.current.play(); }
      setError("");
      startRecording(stream);
    } catch {
      setError(permissionDeniedMessage("camera"));
    }
  // Recorder startup is deliberately read at permission-resolution time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopTracks]);

  useEffect(() => { const timer = window.setTimeout(() => void openCamera(facing), 0); return () => { clearTimeout(timer); if (timerRef.current) clearInterval(timerRef.current); stopTracks(); if(draftUrlRef.current)URL.revokeObjectURL(draftUrlRef.current); }; }, [facing, openCamera, stopTracks]);

  function stopRecording() { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); }
  function startRecording(provided?: MediaStream) {
    const stream = provided ?? streamRef.current;
    if (!stream) return;
    const preferred = TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
    chunksRef.current = [];
    startedRef.current = Date.now();
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const elapsed = Date.now() - startedRef.current;
      if (elapsed < 700 || !chunksRef.current.length) { stream.getTracks().forEach((track)=>track.stop()); onCancel(); return; }
      const duration = Math.min(LIMIT_SECONDS, Math.max(1, Math.round(elapsed / 1000)));
      const mimeType = (recorder.mimeType || preferred || "video/webm").split(";")[0];
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const next = { blob, duration, mimeType, url: URL.createObjectURL(blob) }; draftUrlRef.current = next.url;
      setDraft(next); setSeconds(duration); setRecording(false); stopTracks();
      requestAnimationFrame(() => { if (previewRef.current) { previewRef.current.srcObject = null; previewRef.current.src = next.url; } });
      if (autoSendRef.current) void onSend(next);
    };
    recorder.start(250); setRecording(true); setSeconds(0);
    if (autoSendRef.current) queueMicrotask(() => recorder.state === "recording" && recorder.stop());
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedRef.current) / 1000);
      setSeconds(elapsed); if (elapsed >= LIMIT_SECONDS) stopRecording();
    }, 250);
  }

  // Android app backgrounded: stop into a reviewable draft (never auto-send) and release the
  // camera. A still-open idle preview is closed entirely.
  useEffect(() => {
    const onPause = () => { autoSendRef.current = false; if (recorderRef.current?.state === "recording") recorderRef.current.stop(); else if (streamRef.current) onCancel(); };
    window.addEventListener(NATIVE_PAUSE_EVENT, onPause);
    return () => window.removeEventListener(NATIVE_PAUSE_EVENT, onPause);
  }, [onCancel]);
  useEffect(() => { if(releaseToken>handledRelease.current){handledRelease.current=releaseToken;autoSendRef.current=true;stopRecording();} },[releaseToken]);

  function retry() { if (draft) URL.revokeObjectURL(draft.url); draftUrlRef.current="";setDraft(null); setSeconds(0); void openCamera(facing); }
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <section className="mx-3 mb-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-solid)] p-3 shadow-[var(--shadow)]" aria-label="Video xabar yozish">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-52 w-52 overflow-hidden rounded-full bg-black ring-4 ring-[var(--accent-soft)]">
          <video ref={previewRef} muted={!draft} controls={Boolean(draft)} playsInline className="h-full w-full object-cover" />
          {recording ? <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/55 px-2 py-1 font-mono text-xs text-white">{time}</span> : null}
        </div>
        {error ? <p className="text-center text-sm text-[var(--danger)]">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button type="button" className="icon-button" aria-label="Bekor qilish" onClick={onCancel}><X size={20} /></button>
          {!draft && !recording ? <>
            <button type="button" className="icon-button" aria-label="Kamerani almashtirish" onClick={() => setFacing((value) => value === "user" ? "environment" : "user")}><RotateCcw size={19} /></button>
            <button type="button" disabled={Boolean(error)} className="send-button" aria-label="Yozishni boshlash" onClick={() => startRecording()}><Camera size={20} /></button>
          </> : null}
          {recording && locked ? <><button type="button" className="icon-button text-[var(--danger)]" aria-label="Video yozuvni bekor qilish" onClick={onCancel}><X size={20}/></button><button type="button" className="send-button bg-red-500" aria-label="Yozishni to'xtatish" onClick={() => {autoSendRef.current=false;stopRecording();}}><Square size={17} fill="currentColor" /></button></> : null}
          {draft ? <>
            <button type="button" className="icon-button" aria-label="Qayta yozish" onClick={retry}><CameraIcon size={19} /></button>
            <button type="button" className="icon-button" aria-label="Ko'rish" onClick={() => void previewRef.current?.play()}><Play size={19} /></button>
            <button type="button" className="send-button" aria-label="Yuborish" onClick={() => void onSend(draft)}><Send size={18} /></button>
          </> : null}
        </div>
      </div>
    </section>
  );
}
