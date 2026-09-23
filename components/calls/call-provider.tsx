"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneOff, RefreshCw } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getIceServers } from "@/lib/calls/ice";
import { pauseActiveMedia } from "@/lib/media/playback";
import type { Call, CallStatus, CallType, Profile } from "@/lib/chat/types";
import Avatar from "@/components/app/avatar";

type Api = { startCall: (type: CallType) => Promise<void>; activeCall: Call | null; history: Call[]; canCall: boolean; clearCompletedHistory: () => void };
const CallsContext = createContext<Api>({ startCall: async () => {}, activeCall: null, history: [], canCall: false, clearCompletedHistory: () => {} });
export const useCalls = () => useContext(CallsContext);

type Signal = { callId: string; from: string; to: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

export default function CallProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [conversationId, setConversationId] = useState("");
  const [other, setOther] = useState<Profile | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [history, setHistory] = useState<Call[]>([]);
  const [phase, setPhase] = useState<"ringing" | "connecting" | "connected">("ringing");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [browserSupported] = useState(() => typeof window !== "undefined" && "mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices && "RTCPeerConnection" in window && "MediaStream" in window);
  const [channelReady, setChannelReady] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pendingOffers = useRef(new Map<string, RTCSessionDescriptionInit>());
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const callRef = useRef<Call | null>(null);
  useEffect(() => { callRef.current = call; }, [call]);

  const cleanupMedia = useCallback(() => {
    pcRef.current?.close(); pcRef.current = null;
    localRef.current?.getTracks().forEach((track) => track.stop()); localRef.current = null;
    remoteRef.current?.getTracks().forEach((track) => track.stop()); remoteRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    pendingOffers.current.clear(); pendingCandidates.current.clear();
  }, []);

  useEffect(() => () => cleanupMedia(), [cleanupMedia]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const membership = await supabase.from("conversation_members").select("conversation_id").eq("user_id", userId).limit(1).maybeSingle();
      if (!active || !membership.data) return;
      const cid = String(membership.data.conversation_id);
      const members = await supabase.from("conversation_members").select("user_id").eq("conversation_id", cid);
      const otherId = (members.data ?? []).map((row) => String(row.user_id)).find((id) => id !== userId);
      if (!otherId) return;
      const profile = await supabase.from("profiles").select("*").eq("id", otherId).single();
      if (active) { setConversationId(cid); setOther(profile.data as Profile); }
    })();
    return () => { active = false; };
  }, [supabase, userId]);

  const sendSignal = useCallback((event: string, payload: Omit<Signal, "from">) => {
    void channelRef.current?.send({ type: "broadcast", event, payload: { ...payload, from: userId } });
  }, [userId]);

  const flushCandidates = useCallback(async (callId: string, pc: RTCPeerConnection) => {
    const queued = pendingCandidates.current.get(callId) ?? [];
    pendingCandidates.current.delete(callId);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch { /* Stale/duplicate candidates are harmless. */ }
    }
  }, []);

  const buildPeer = useCallback((current: Call) => {
    pcRef.current?.close();
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    pcRef.current = pc;
    localRef.current?.getTracks().forEach((track) => pc.addTrack(track, localRef.current!));
    const remote = new MediaStream(); remoteRef.current = remote;
    pc.ontrack = (event) => { event.streams[0]?.getTracks().forEach((track) => remote.addTrack(track)); if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote; if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remote; };
    pc.onicecandidate = (event) => { if (event.candidate) sendSignal("ice", { callId: current.id, to: current.caller_id === userId ? current.callee_id : current.caller_id, candidate: event.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setPhase("connected");
      if (pc.connectionState === "failed") {
        setError("Qo'ng'iroqni ulab bo'lmadi.");
        const active = callRef.current;
        if (active) void supabase.rpc("transition_private_call", { p_call_id: active.id, p_status: "failed" });
        callRef.current = null; cleanupMedia(); setCall(null);
      }
    };
    return pc;
  }, [cleanupMedia, sendSignal, supabase, userId]);

  async function openMedia(type: CallType) {
    pauseActiveMedia();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" ? { facingMode: { ideal: "user" } } : false });
      localRef.current = stream; if (localVideoRef.current) localVideoRef.current.srcObject = stream; return true;
    } catch {
      setError(type === "video" ? "Kamera yoki mikrofonga ruxsat berilmadi." : "Mikrofonga ruxsat berilmadi."); return false;
    }
  }

  const finish = useCallback(async (status: CallStatus) => {
    const current = callRef.current;
    if (current && !["declined","missed","cancelled","ended","failed"].includes(current.status)) {
      await supabase.rpc("transition_private_call", { p_call_id: current.id, p_status: status });
    }
    callRef.current = null; cleanupMedia(); setCall(null); setSeconds(0); setError("");
  }, [cleanupMedia, supabase]);

  const startCall = useCallback(async (type: CallType) => {
    if (!browserSupported || !channelReady || !conversationId || !other || callRef.current) return;
    setError("");
    const ready = await openMedia(type); if (!ready) return;
    const result = await supabase.rpc("create_private_call", { p_conversation_id: conversationId, p_callee_id: other.id, p_type: type }).single();
    if (result.error || !result.data) { cleanupMedia(); setError("Qo'ng'iroqni boshlab bo'lmadi."); return; }
    const next = result.data as Call; callRef.current = next; setCall(next); setPhase("ringing");
    const pc = buildPeer(next); const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    sendSignal("offer", { callId: next.id, to: next.callee_id, description: offer });
  }, [browserSupported, buildPeer, channelReady, cleanupMedia, conversationId, other, sendSignal, supabase]);

  const accept = useCallback(async () => {
    const current = callRef.current; if (!current) return;
    setPhase("connecting"); const ready = await openMedia(current.type); if (!ready) return;
    const transition = await supabase.rpc("transition_private_call", { p_call_id: current.id, p_status: "accepted" }).single();
    if (transition.error) return void finish("failed");
    const pc = buildPeer(current); const offer = pendingOffers.current.get(current.id);
    if (!offer) { sendSignal("ready", { callId: current.id, to: current.caller_id }); return; }
    await pc.setRemoteDescription(offer); await flushCandidates(current.id, pc);
    const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
    sendSignal("answer", { callId: current.id, to: current.caller_id, description: answer });
  }, [buildPeer, finish, flushCandidates, sendSignal, supabase]);

  useEffect(() => {
    if (!conversationId || !other) return;
    let disposed = false;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session || disposed) return;
      await supabase.realtime.setAuth(data.session.access_token);
      const channel = supabase.channel(`calls:${conversationId}`, { config: { private: true, broadcast: { self: false } } });
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (payload) => {
          const row = payload.new as Call;
          if (!row?.id || row.conversation_id !== conversationId || ![row.caller_id,row.callee_id].includes(userId)) return;
          setHistory((current) => [...current.filter((item) => item.id !== row.id), row].sort((a,b) => a.created_at.localeCompare(b.created_at)));
          if (row.status === "ringing") { if (!callRef.current || callRef.current.id === row.id) { callRef.current = row; setCall(row); setPhase("ringing"); } }
          else if (row.status === "accepted") { if (callRef.current?.id === row.id) { callRef.current = row; setCall(row); } }
          else if (callRef.current?.id === row.id) { callRef.current = null; cleanupMedia(); setCall(null); setSeconds(0); }
        })
        .on("broadcast", { event: "offer" }, async ({ payload }) => { const signal=payload as Signal; if(signal.to!==userId||signal.from!==other.id||!signal.description)return; pendingOffers.current.set(signal.callId,signal.description); const current=callRef.current;const pc=pcRef.current;if(signal.callId!==current?.id||current.callee_id!==userId||!pc||pc.signalingState!=="stable"||pc.remoteDescription)return;try{await pc.setRemoteDescription(signal.description);await flushCandidates(current.id,pc);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);sendSignal("answer",{callId:current.id,to:current.caller_id,description:answer});}catch{} })
        .on("broadcast", { event: "ready" }, async ({ payload }) => { const signal=payload as Signal; const current=callRef.current; const pc=pcRef.current; if(signal.to!==userId||signal.from!==other.id||signal.callId!==current?.id||!pc)return; const offer=pc.localDescription; if(offer) sendSignal("offer",{callId:current.id,to:other.id,description:offer.toJSON()}); })
        .on("broadcast", { event: "answer" }, async ({ payload }) => { const signal=payload as Signal; const current=callRef.current; const pc=pcRef.current; if(signal.to!==userId||signal.from!==other.id||signal.callId!==current?.id||!signal.description||!pc||pc.signalingState!=="have-local-offer")return; try { await pc.setRemoteDescription(signal.description); await flushCandidates(current.id,pc); } catch {} })
        .on("broadcast", { event: "ice" }, async ({ payload }) => { const signal=payload as Signal; const current=callRef.current; const pc=pcRef.current; if(signal.to!==userId||signal.from!==other.id||signal.callId!==current?.id||!signal.candidate)return; if(!pc?.remoteDescription){const queue=pendingCandidates.current.get(signal.callId)??[];queue.push(signal.candidate);pendingCandidates.current.set(signal.callId,queue.slice(-64));return;} try{await pc.addIceCandidate(signal.candidate);}catch{} })
        .subscribe((status) => setChannelReady(status === "SUBSCRIBED"));
      channelRef.current = channel;
      const stale = await supabase.from("calls").select("*").eq("conversation_id",conversationId).in("status",["ringing","accepted"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
      const historyResult = await supabase.from("calls").select("*").eq("conversation_id",conversationId).order("created_at",{ascending:true}).limit(100);
      if (historyResult.data) setHistory(historyResult.data as Call[]);
      if (stale.data) { const row=stale.data as Call; if(row.status==="ringing"&&Date.now()-new Date(row.created_at).getTime()>40000) await supabase.rpc("expire_private_call",{p_call_id:row.id}); else if(row.status==="accepted") await supabase.rpc("transition_private_call",{p_call_id:row.id,p_status:"failed"}); else { callRef.current=row; setCall(row); } }
    });
    return () => { disposed=true; setChannelReady(false); if(channelRef.current) void supabase.removeChannel(channelRef.current); channelRef.current=null; callRef.current=null; cleanupMedia(); };
  }, [cleanupMedia, conversationId, flushCandidates, other, sendSignal, supabase, userId]);

  useEffect(() => { if(!call||call.status!=="ringing")return; const remaining=Math.max(0,40000-(Date.now()-new Date(call.created_at).getTime())); const timer=setTimeout(()=>void supabase.rpc("expire_private_call",{p_call_id:call.id}),remaining); return()=>clearTimeout(timer); },[call,supabase]);
  useEffect(() => { if(phase!=="connected")return; const timer=setInterval(()=>setSeconds((v)=>v+1),1000); return()=>clearInterval(timer); },[phase]);
  useEffect(() => { if(localVideoRef.current) localVideoRef.current.srcObject=localRef.current; if(remoteVideoRef.current) remoteVideoRef.current.srcObject=remoteRef.current; if(remoteAudioRef.current) remoteAudioRef.current.srcObject=remoteRef.current; },[call,phase]);

  const incoming=call?.callee_id===userId&&call.status==="ringing";
  const outgoing=call?.caller_id===userId&&call.status==="ringing";
  const clearCompletedHistory = useCallback(() => setHistory((current) => current.filter((item) => item.status === "ringing" || item.status === "accepted")), []);
  return <CallsContext.Provider value={{startCall,activeCall:call,history,canCall:browserSupported&&channelReady,clearCompletedHistory}}>{children}
    {error&&!call?<div className="toast" role="alert">{error}</div>:null}
    {call?<div className="call-overlay" role="dialog" aria-label={call.type==="video"?"Video qo'ng'iroq":"Audio qo'ng'iroq"}>
      {call.type==="video"&&phase!=="ringing"?<video ref={remoteVideoRef} autoPlay playsInline className="call-remote-video"/>:null}
      <audio ref={remoteAudioRef} autoPlay />
      <div className="call-content">
        {call.type!=="video"||phase==="ringing"?<Avatar profile={other} size="lg"/>:null}
        <h2>{other?.display_name??"Suhbatdosh"}</h2>
        <p>{incoming?(call.type==="video"?"Video qo'ng'iroq":"Audio qo'ng'iroq"):outgoing?"Qo'ng'iroq qilinmoqda...":phase==="connected"?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`:"Ulanmoqda..."}</p>
        {error?<p className="text-red-300">{error}</p>:null}
      </div>
      {call.type==="video"&&phase!=="ringing"?<video ref={localVideoRef} autoPlay muted playsInline className="call-local-video"/>:null}
      <div className="call-controls">
        {incoming?<><button className="call-button accept" onClick={()=>void accept()} aria-label="Qabul qilish"><Phone/></button><button className="call-button end" onClick={()=>void finish("declined")} aria-label="Rad etish"><PhoneOff/></button></>:null}
        {outgoing?<button className="call-button end" onClick={()=>void finish("cancelled")} aria-label="Bekor qilish"><PhoneOff/></button>:null}
        {!incoming&&!outgoing?<><button className="call-button" onClick={()=>{const next=!muted;localRef.current?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next);}} aria-label={muted?"Mikrofonni yoqish":"Mikrofonni o'chirish"}>{muted?<MicOff/>:<Mic/>}</button>{call.type==="video"?<><button className="call-button" onClick={()=>{const next=!cameraOff;localRef.current?.getVideoTracks().forEach(t=>t.enabled=!next);setCameraOff(next);}} aria-label={cameraOff?"Kamerani yoqish":"Kamerani o'chirish"}>{cameraOff?<CameraOff/>:<Camera/>}</button><button className="call-button" onClick={async()=>{const track=localRef.current?.getVideoTracks()[0];if(!track)return;const mode=track.getSettings().facingMode==="environment"?"user":"environment";const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:mode}}});const next=stream.getVideoTracks()[0];const sender=pcRef.current?.getSenders().find(s=>s.track?.kind==="video");await sender?.replaceTrack(next);track.stop();localRef.current?.removeTrack(track);localRef.current?.addTrack(next);if(localVideoRef.current)localVideoRef.current.srcObject=localRef.current;}} aria-label="Kamerani almashtirish"><RefreshCw/></button></>:null}<button className="call-button end" onClick={()=>void finish("ended")} aria-label="Tugatish"><PhoneOff/></button></>:null}
      </div>
    </div>:null}
  </CallsContext.Provider>;
}
