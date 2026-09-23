"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHAT_BUCKET, PAGE_SIZE } from "@/lib/chat/constants";
import type { BackgroundProposal, Message, MessageRead } from "@/lib/chat/types";
import { hydrateMessages, mergeRead, normalizeMessage, sortMessages, upsertMessage } from "@/lib/chat/messages";
import { useConversationContext } from "@/lib/chat/use-conversation-context";
import { useConversationRealtime } from "@/lib/realtime/use-conversation-realtime";
import { isMissingSchemaError, logSupabaseError } from "@/lib/supabase/errors";
import type { UserIdentity } from "@/lib/identity";
import { wallpaperCss } from "@/lib/wallpapers";
import ChatHeader from "./chat-header";
import MessageList from "./message-list";
import MessageComposer, { type OutgoingMessage } from "./message-composer";
import MediaViewer from "./media-viewer";
import ChatSettings from "./chat-settings";
import ContactDetails from "./contact-details";
import MessageSelectionBar from "./message-selection-bar";
import { useCalls } from "@/components/calls/call-provider";
import { pauseActiveMedia } from "@/lib/media/playback";

type Props = { userId: string; identity: UserIdentity };
type ViewerState = { src: string; name: string; type: "image" | "video" } | null;
type LocalBackground = { id: string; at: number } | null;
type SharedBackground = { id: string | null; at: number };

const MEDIA_TYPES = new Set(["image", "video", "video_note", "voice"]);
const ENRICH_RETRY_MS = [800, 2000, 4500];

function readLocalBackground(identity: UserIdentity): LocalBackground {
  try {
    const raw = localStorage.getItem(`chat-background:${identity}`);
    if (!raw) return null;
    if (raw.startsWith("{")) return JSON.parse(raw) as LocalBackground;
    return { id: raw, at: 0 };
  } catch {
    return null;
  }
}

export default function ChatShell({ userId, identity }: Props) {
  const { history: callHistory, clearCompletedHistory } = useCalls();
  const supabase = useMemo(() => createClient(), []);
  const context = useConversationContext(supabase, userId);
  const { conversationId, me, other, nickname, applyProfile, setNickname } = context;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [viewer, setViewer] = useState<ViewerState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [localBackground, setLocalBackground] = useState<LocalBackground>(null);
  const [sharedBackground, setSharedBackground] = useState<SharedBackground>({ id: null, at: 0 });
  const [proposal, setProposal] = useState<BackgroundProposal | null>(null);
  const [outgoing, setOutgoing] = useState<BackgroundProposal | null>(null);
  const [notice, setNotice] = useState("");
  const [historyReset, setHistoryReset] = useState(0);
  const [pendingCleanup, setPendingCleanup] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionConfirming, setSelectionConfirming] = useState(false);
  const [selectionDeleting, setSelectionDeleting] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const readSent = useRef(new Set<string>());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const flash = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
  }, []);

  const resetHistoryUi = useCallback(() => {
    pauseActiveMedia();
    setMessages([]); messagesRef.current = [];
    setReplyTo(null); setViewer(null); setHasOlder(false); setOlderLoading(false);
    setSelectedIds(new Set()); setSelectionConfirming(false); setSelectionDeleting(false);
    readSent.current.clear(); clearCompletedHistory();
    setHistoryReset((value) => value + 1);
  }, [clearCompletedHistory]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedIds(new Set());
      setSelectionConfirming(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [conversationId]);

  const cleanupOwnMedia = useCallback(async () => {
    if (!conversationId) return true;
    const jobs = await supabase.from("message_media_cleanup_jobs").select("id,storage_path").eq("conversation_id", conversationId).eq("owner_id", userId).limit(1000);
    if (jobs.error) { logSupabaseError("[chat-clear] load cleanup jobs", jobs.error); setPendingCleanup(true); return false; }
    const rows = (jobs.data ?? []) as Array<{ id: string; storage_path: string }>;
    let failed = false;
    for (let index = 0; index < rows.length; index += 100) {
      const batch = rows.slice(index, index + 100).filter((row) => row.storage_path.startsWith(`${conversationId}/${userId}/`) && !row.storage_path.includes("/stories/"));
      if (!batch.length) { failed = true; continue; }
      const removed = await supabase.storage.from(CHAT_BUCKET).remove(batch.map((row) => row.storage_path));
      if (removed.error) { console.error("[chat-clear] storage cleanup", { message: removed.error.message, count: batch.length }); failed = true; continue; }
      const deleted = await supabase.from("message_media_cleanup_jobs").delete().in("id", batch.map((row) => row.id));
      if (deleted.error) { logSupabaseError("[chat-clear] remove cleanup jobs", deleted.error); failed = true; }
    }
    setPendingCleanup(failed);
    return !failed;
  }, [conversationId, supabase, userId]);

  const retryMediaCleanup = useCallback(async () => {
    if (await cleanupOwnMedia()) flash("Media fayllari tozalandi");
    else flash("Ba'zi media fayllarini tozalab bo'lmadi");
  }, [cleanupOwnMedia, flash]);

  useEffect(() => { if (!conversationId) return; const timer=window.setTimeout(()=>void cleanupOwnMedia(),0);return()=>clearTimeout(timer); }, [cleanupOwnMedia, conversationId]);

  const clearHistory = useCallback(async () => {
    if (!conversationId) return false;

    const { data: userData, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !userData.user || userData.user.id !== userId) {
      logSupabaseError("[chat-clear] verify session", sessionError);
      flash("Sessiya tugagan. Qayta kiring.");
      return false;
    }

    const { data, error } = await supabase.rpc("clear_conversation_history", { p_conversation_id: conversationId });
    if (error || !data) {
      logSupabaseError("[chat-clear] clear history", error);
      flash("Chatni tozalab bo'lmadi. Qayta urinib ko'ring.");
      return false;
    }
    resetHistoryUi();
    const mediaClean = await cleanupOwnMedia();
    flash(mediaClean ? "Chat tozalandi" : "Chat tozalandi, ayrim media fayllari kutilmoqda");
    return true;
  }, [cleanupOwnMedia, conversationId, flash, resetHistoryUi, supabase, userId]);

  /** Enrichment runs AFTER the message is already on screen, and merges by id. */
  const enrich = useCallback(async (message: Message) => {
    for (let attempt = 0; ; attempt += 1) {
      const [hydrated] = await hydrateMessages(supabase, [message]);
      if (!hydrated) return;
      setMessages((current) => current.some((item) => item.id === hydrated.id)
        ? upsertMessage(current, { ...hydrated, pending: null })
        : current);
      // Media rows are inserted right after the message row; retry briefly if not there yet.
      const waiting = MEDIA_TYPES.has(message.type) && !hydrated.message_attachments?.length;
      if (!waiting || attempt >= ENRICH_RETRY_MS.length) return;
      await new Promise((resolve) => window.setTimeout(resolve, ENRICH_RETRY_MS[attempt]));
    }
  }, [supabase]);

  const receiveMessage = useCallback((incoming: Message) => {
    if (incoming.conversation_id !== conversationId) return;
    if (incoming.deleted_at) {
      setSelectedIds((current) => {
        if (!current.has(incoming.id)) return current;
        const next = new Set(current); next.delete(incoming.id); return next;
      });
    }
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === incoming.id);
      if (index === -1) return [...current, incoming].sort(sortMessages);
      // Our own optimistic copy: confirm it with the server timestamp, keep local enrichment.
      if (current[index].pending) return upsertMessage(current, { ...incoming, pending: null });
      return current;
    });
    void enrich(incoming);
  }, [conversationId, enrich]);

  const fetchLatest = useCallback(async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      logSupabaseError("[chat] load messages", error);
      return null;
    }
    const rows = ((data ?? []) as Record<string, unknown>[]).map(normalizeMessage).reverse();
    return { rows: await hydrateMessages(supabase, rows), full: rows.length === PAGE_SIZE };
  }, [conversationId, supabase]);

  // Initial history + shared settings, once the conversation is known.
  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    void (async () => {
      const [latest, settings, incomingProposal, outgoingProposal] = await Promise.all([
        fetchLatest(),
        supabase.from("conversation_settings").select("shared_background,updated_at").eq("conversation_id", conversationId).maybeSingle(),
        supabase.from("background_proposals").select("*").eq("conversation_id", conversationId).eq("recipient_id", userId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("background_proposals").select("*").eq("conversation_id", conversationId).eq("proposer_id", userId).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!active) return;
      for (const result of [settings, incomingProposal, outgoingProposal]) {
        if (result.error && !isMissingSchemaError(result.error)) logSupabaseError("[chat] load background state", result.error);
      }
      setLocalBackground(readLocalBackground(identity));
      if (settings.data) setSharedBackground({ id: settings.data.shared_background ?? null, at: new Date(settings.data.updated_at ?? 0).getTime() });
      setProposal((incomingProposal.data as BackgroundProposal | null) ?? null);
      setOutgoing((outgoingProposal.data as BackgroundProposal | null) ?? null);
      if (!latest) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      // Merge rather than replace: a realtime INSERT may already have arrived.
      setMessages((current) => latest.rows.reduce(upsertMessage, current));
      setHasOlder(latest.full);
      setLoadError(false);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [conversationId, fetchLatest, identity, supabase, userId]);

  const retryLoad = useCallback(async () => {
    setLoading(true);
    const latest = await fetchLatest();
    setLoading(false);
    if (!latest) return setLoadError(true);
    setLoadError(false);
    setMessages((current) => latest.rows.reduce(upsertMessage, current));
    setHasOlder(latest.full);
  }, [fetchLatest]);

  const realtime = useConversationRealtime(supabase, conversationId, userId, {
    onMessageInsert: receiveMessage,
    onMessageUpdate: (incoming) => {
      setMessages((current) => {
        const known = current.some((item) => item.id === incoming.id);
        const next = known ? upsertMessage(current, incoming) : current;
        return next.map((item) => item.reply_to?.id === incoming.id ? { ...item, reply_to: { ...item.reply_to, ...incoming } } : item);
      });
    },
    onMessageDeleteBatch: (ids) => { const removed=new Set(ids);setMessages((current)=>current.filter((item)=>!removed.has(item.id))); },
    onRead: (read: MessageRead) => setMessages((current) => mergeRead(current, read)),
    // Catch up on anything missed while the socket was down or the phone was asleep.
    onResync: () => {
      void fetchLatest().then((latest) => {
        if (latest) setMessages((current) => latest.rows.reduce(upsertMessage, current));
      });
    },
    onProfile: (row) => void applyProfile(row),
    onProposal: (row) => {
      const next = row as unknown as BackgroundProposal;
      if (next.recipient_id === userId) {
        if (next.status === "pending") setProposal(next);
        else setProposal((current) => (current?.id === next.id ? null : current));
      }
      if (next.proposer_id === userId) {
        if (next.status === "pending") setOutgoing(next);
        else {
          setOutgoing((current) => (current?.id === next.id ? null : current));
          if (next.status === "rejected") flash(`${other?.display_name ?? "Suhbatdosh"} taklifni rad etdi`);
        }
      }
    },
    onSettings: (row) => setSharedBackground({ id: (row.shared_background as string | null) ?? null, at: new Date(String(row.updated_at ?? Date.now())).getTime() }),
    onHistoryClear: () => { resetHistoryUi(); void cleanupOwnMedia(); },
  });

  // Read receipts: only while the chat is actually visible.
  const markRead = useCallback(() => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    const unread = messagesRef.current.filter((message) =>
      message.sender_id !== userId && !message.pending && !message.deleted_at &&
      !message.message_reads?.some((read) => read.user_id === userId) &&
      !readSent.current.has(message.id));
    if (!unread.length) return;
    unread.forEach((message) => readSent.current.add(message.id));
    void supabase
      .from("message_reads")
      .upsert(unread.map((message) => ({ message_id: message.id, user_id: userId })), { onConflict: "message_id,user_id", ignoreDuplicates: true })
      .then(({ error }) => {
        if (!error) return;
        logSupabaseError("[chat] mark read", error);
        unread.forEach((message) => readSent.current.delete(message.id));
      });
  }, [supabase, userId]);

  useEffect(() => {
    if (!loading) markRead();
  }, [loading, markRead, messages]);

  useEffect(() => {
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [markRead]);

  async function loadOlder() {
    const first = messagesRef.current.find((message) => !message.pending);
    if (!first?.created_at || olderLoading || !hasOlder) return;
    setOlderLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .or(`created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) logSupabaseError("[chat] load older", error);
    else {
      const rows = ((data ?? []) as Record<string, unknown>[]).map(normalizeMessage).reverse();
      const older = await hydrateMessages(supabase, rows);
      setMessages((current) => older.reduce(upsertMessage, current));
      setHasOlder(rows.length === PAGE_SIZE);
    }
    setOlderLoading(false);
  }

  const loadReplyContext = useCallback(async (messageId: string) => {
    if (messagesRef.current.some((message) => message.id === messageId)) return;
    const targetResult = await supabase.from("messages").select("*").eq("conversation_id", conversationId).eq("id", messageId).maybeSingle();
    if (targetResult.error || !targetResult.data) {
      logSupabaseError("[chat] load reply target", targetResult.error);
      flash("Asl xabar topilmadi");
      return;
    }
    const target = normalizeMessage(targetResult.data as Record<string, unknown>);
    const [before, after] = await Promise.all([
      supabase.from("messages").select("*").eq("conversation_id", conversationId)
        .or(`created_at.lt.${target.created_at},and(created_at.eq.${target.created_at},id.lte.${target.id})`)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(15),
      supabase.from("messages").select("*").eq("conversation_id", conversationId)
        .or(`created_at.gt.${target.created_at},and(created_at.eq.${target.created_at},id.gte.${target.id})`)
        .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(15),
    ]);
    if (before.error || after.error) {
      logSupabaseError("[chat] load reply context", before.error ?? after.error);
      return flash("Asl xabarni yuklab bo'lmadi");
    }
    const rows = [...(before.data ?? []), targetResult.data, ...(after.data ?? [])]
      .map((row) => normalizeMessage(row as Record<string, unknown>));
    const hydrated = await hydrateMessages(supabase, rows);
    setMessages((current) => hydrated.reduce(upsertMessage, current));
  }, [conversationId, flash, supabase]);

  /** Optimistic send: the client-generated id is the dedupe key for the realtime echo. */
  const sendMessage = useCallback(async (outgoingMessage: OutgoingMessage) => {
    if (!conversationId) return false;
    const id = crypto.randomUUID();
    const optimistic: Message = {
      id, conversation_id: conversationId, sender_id: userId,
      type: outgoingMessage.type, content: outgoingMessage.content, reply_to_id: outgoingMessage.replyTo?.id ?? null,
      created_at: new Date().toISOString(), updated_at: null, edited_at: null, deleted_at: null,
      message_attachments: [], message_reads: [], reply_to: outgoingMessage.replyTo ?? null, pending: "sending",
    };
    setMessages((current) => upsertMessage(current, optimistic));
    setReplyTo(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({ id, conversation_id: conversationId, sender_id: userId, type: outgoingMessage.type, content: outgoingMessage.content, reply_to_id: optimistic.reply_to_id })
      .select("*")
      .single();
    if (error || !data) {
      logSupabaseError("[chat] send message", error);
      setMessages((current) => current.map((item) => (item.id === id ? { ...item, pending: "failed" } : item)));
      return false;
    }
    setMessages((current) => upsertMessage(current, { ...normalizeMessage(data as Record<string, unknown>), pending: null }));
    return true;
  }, [conversationId, supabase, userId]);

  async function retrySend(message: Message) {
    setMessages((current) => current.filter((item) => item.id !== message.id));
    await sendMessage({ type: message.type as OutgoingMessage["type"], content: message.content ?? "", replyTo: message.reply_to ?? null });
  }

  async function deleteMessage(message: Message) {
    if (message.sender_id !== userId) return;
    if (message.pending === "failed") return setMessages((current) => current.filter((item) => item.id !== message.id));
    const deletedAt = new Date().toISOString();
    setMessages((current) => upsertMessage(current, { ...message, deleted_at: deletedAt }));
    const { error } = await supabase.from("messages").update({ deleted_at: deletedAt }).eq("id", message.id).eq("sender_id", userId);
    if (error) {
      logSupabaseError("[chat] delete message", error);
      setMessages((current) => upsertMessage(current, { ...message, deleted_at: null }));
      flash("Xabarni o'chirib bo'lmadi");
    }
  }

  function toggleMessageSelection(message: Message) {
    if (message.sender_id !== userId || message.type === "system" || message.deleted_at || message.pending) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(message.id)) next.delete(message.id);
      else next.add(message.id);
      return next;
    });
    setSelectionConfirming(false);
  }

  function exitSelection() {
    if (selectionDeleting) return;
    setSelectedIds(new Set());
    setSelectionConfirming(false);
  }

  async function deleteSelectedMessages() {
    if (selectionDeleting || !selectedIds.size) return;
    const selected = messages.filter((message) => selectedIds.has(message.id) && message.sender_id === userId && !message.deleted_at && !message.pending && message.type !== "system");
    if (!selected.length) return exitSelection();

    setSelectionDeleting(true);
    const deletedAt = new Date().toISOString();
    const ids = selected.map((message) => message.id);
    setMessages((current) => current.map((message) => selectedIds.has(message.id) ? { ...message, deleted_at: deletedAt } : message));
    const deleted = new Set<string>();
    for (let index = 0; index < ids.length; index += 100) {
      const batch = ids.slice(index, index + 100);
      const { data, error } = await supabase.from("messages").update({ deleted_at: deletedAt }).eq("sender_id", userId).in("id", batch).is("deleted_at", null).select("id");
      if (error) logSupabaseError("[chat] delete selected messages", error);
      else (data ?? []).forEach((row) => deleted.add(row.id));
    }
    const failed = ids.filter((id) => !deleted.has(id));
    if (failed.length) {
      const failedSet = new Set(failed);
      setMessages((current) => current.map((message) => failedSet.has(message.id) ? { ...message, deleted_at: null } : message));
      setSelectedIds(failedSet);
      setSelectionDeleting(false);
      setSelectionConfirming(false);
      flash("Ba'zi xabarlarni o'chirib bo'lmadi.");
      return;
    }
    setSelectionDeleting(false);
    exitSelection();
  }

  async function saveNickname(value: string) {
    if (!other) return;
    const { error } = await supabase.from("contacts").upsert({ owner_id: userId, contact_id: other.id, nickname: value.trim() || null, updated_at: new Date().toISOString() });
    if (error) {
      logSupabaseError("[chat] save nickname", error);
      return flash(isMissingSchemaError(error) ? "Kontaktlar hali sozlanmagan" : "Nomni saqlab bo'lmadi");
    }
    setNickname(value.trim());
    flash("Saqlandi");
  }

  function applyLocalBackground(id: string) {
    const next = { id, at: Date.now() };
    try {
      localStorage.setItem(`chat-background:${identity}`, JSON.stringify(next));
    } catch {
      // Private mode: still apply for this session.
    }
    setLocalBackground(next);
  }

  async function proposeBackground(id: string) {
    if (!other) return;
    // One pending proposal at a time: cancel my previous one.
    await supabase.from("background_proposals").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("proposer_id", userId).eq("status", "pending");
    const { data, error } = await supabase.from("background_proposals").insert({ conversation_id: conversationId, proposer_id: userId, recipient_id: other.id, background_id: id }).select("*").single();
    if (error) {
      logSupabaseError("[chat] propose background", error);
      return flash(isMissingSchemaError(error) ? "Umumiy fonlar hali sozlanmagan" : "Taklif yuborilmadi");
    }
    setOutgoing(data as BackgroundProposal);
    setSettingsOpen(false);
    flash("Taklif yuborildi");
  }

  async function cancelOutgoing() {
    if (!outgoing) return;
    const { error } = await supabase.from("background_proposals").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", outgoing.id).eq("status", "pending");
    if (error) return logSupabaseError("[chat] cancel proposal", error);
    setOutgoing(null);
  }

  async function resolveProposal(status: "accepted" | "rejected") {
    if (!proposal) return;
    const current = proposal;
    setProposal(null);
    // Atomic on the server: proposal status + shared setting + system event.
    const { error } = await supabase.rpc("resolve_background_proposal", { p_proposal_id: current.id, p_status: status });
    if (error) {
      logSupabaseError("[chat] resolve proposal", error);
      setProposal(current);
      return flash("Amalni bajarib bo'lmadi");
    }
    if (status === "accepted") setSharedBackground({ id: current.background_id, at: Date.now() });
  }

  const activeBackground = localBackground && localBackground.at > sharedBackground.at ? localBackground.id : sharedBackground.id ?? localBackground?.id ?? null;
  const backgroundCss = wallpaperCss(activeBackground);
  const otherName = nickname || other?.display_name || "Suhbatdosh";
  const profiles = { [userId]: me, ...(other ? { [other.id]: other } : {}) };
  const callMessages = callHistory.map((call): Message => {
    const duration = call.answered_at && call.ended_at ? Math.max(0, Math.round((new Date(call.ended_at).getTime() - new Date(call.answered_at).getTime()) / 1000)) : 0;
    const durationLabel = duration ? ` · ${Math.floor(duration / 60)} daqiqa ${duration % 60} soniya` : "";
    const statusLabel = call.status === "missed" ? "Javobsiz qo'ng'iroq" : call.status === "declined" ? "Rad etilgan qo'ng'iroq" : call.status === "cancelled" ? "Bekor qilingan qo'ng'iroq" : call.type === "video" ? "Video qo'ng'iroq" : "Audio qo'ng'iroq";
    return { id: `call-${call.id}`, conversation_id: call.conversation_id, sender_id: call.caller_id, type: "system", content: `${statusLabel}${durationLabel}`, reply_to_id: null, created_at: call.created_at, updated_at: call.updated_at, edited_at: null, deleted_at: null };
  });
  const timeline = [...messages, ...callMessages].sort(sortMessages);

  return (
    <main className="chat-app relative mx-auto flex h-[100dvh] max-w-3xl flex-col overflow-hidden shadow-[var(--shadow)]" style={backgroundCss ? { background: backgroundCss } : undefined}>
      {selectedIds.size ? <MessageSelectionBar
        count={selectedIds.size}
        confirming={selectionConfirming}
        deleting={selectionDeleting}
        onBack={exitSelection}
        onRequestDelete={() => setSelectionConfirming(true)}
        onCancelDelete={() => setSelectionConfirming(false)}
        onConfirmDelete={() => void deleteSelectedMessages()}
      /> : <ChatHeader
        other={other}
        name={otherName}
        online={realtime.online}
        typing={realtime.typing}
        status={realtime.status}
        onDetails={() => setDetailsOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />}
      {context.state === "error" || context.state === "empty" ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-semibold">{context.state === "empty" ? "Suhbat topilmadi" : "Suhbatni yuklab bo'lmadi"}</p>
          <button type="button" className="primary-button" onClick={() => void context.reload()}>Qayta urinish</button>
        </div>
      ) : (
        <MessageList
          key={`history-${historyReset}`}
          userId={userId}
          me={me}
          other={other}
          otherName={otherName}
          messages={timeline}
          loading={loading}
          loadError={loadError}
          onRetryLoad={() => void retryLoad()}
          olderLoading={olderLoading}
          hasOlder={hasOlder}
          onLoadOlder={loadOlder}
          onNavigateReply={loadReplyContext}
          onReply={setReplyTo}
          onDelete={deleteMessage}
          selectedIds={selectedIds}
          onSelect={toggleMessageSelection}
          onRetry={(message) => void retrySend(message)}
          onNotice={flash}
          onOpenMedia={setViewer}
        />
      )}
      {notice ? <div className="toast" role="status">{notice}</div> : null}
      {outgoing ? (
        <div className="relative z-20 mx-3 mb-2 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs backdrop-blur-xl">
          <span className="h-7 w-7 shrink-0 rounded-lg border border-[var(--border)]" style={{ background: wallpaperCss(outgoing.background_id) }} />
          <span className="muted min-w-0 flex-1 truncate">Fon taklifi {otherName}ga yuborildi · kutilmoqda</span>
          <button type="button" onClick={() => void cancelOutgoing()} className="font-semibold text-[var(--accent)]">Bekor qilish</button>
        </div>
      ) : null}
      <MessageComposer
        key={`composer-${historyReset}`}
        userId={userId}
        conversationId={conversationId}
        replyTo={replyTo}
        profiles={profiles}
        onCancelReply={() => setReplyTo(null)}
        onTyping={realtime.sendTyping}
        onSend={sendMessage}
        onSent={(message) => {
          setReplyTo(null);
          if (message) receiveMessage(normalizeMessage(message as unknown as Record<string, unknown>));
        }}
      />
      <MediaViewer viewer={viewer} onClose={() => setViewer(null)} />
      {proposal ? (
        <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) void resolveProposal("rejected"); }}>
          <section className="bottom-sheet p-5" role="dialog" aria-label="Chat foni taklifi">
            <p className="text-base font-bold">{otherName} yangi chat fonini taklif qildi</p>
            <p className="muted mt-1 text-sm">Qabul qilsangiz, ikkalangizda ham shu fon o&apos;rnatiladi.</p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] p-4" style={{ background: wallpaperCss(proposal.background_id) }}>
              <div className="ml-auto w-fit max-w-[70%] rounded-2xl rounded-br-md bg-[var(--sent)] px-3 py-2 text-xs text-[var(--sent-text)]">Qanday ko&apos;rinadi?</div>
              <div className="mt-2 w-fit max-w-[70%] rounded-2xl rounded-bl-md bg-[var(--received)] px-3 py-2 text-xs text-[var(--received-text)]">Juda chiroyli ✨</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void resolveProposal("rejected")} className="h-11 rounded-xl bg-[var(--surface-elevated)] text-sm font-bold">Rad etish</button>
              <button type="button" onClick={() => void resolveProposal("accepted")} className="primary-button">Qabul qilish</button>
            </div>
          </section>
        </div>
      ) : null}
      {settingsOpen ? <ChatSettings selected={activeBackground} onApply={applyLocalBackground} onPropose={proposeBackground} onClear={clearHistory} pendingCleanup={pendingCleanup} onRetryCleanup={retryMediaCleanup} onClose={() => setSettingsOpen(false)} /> : null}
      {detailsOpen ? <ContactDetails profile={other} name={otherName} online={realtime.online} nickname={nickname} onSaveNickname={saveNickname} onClose={() => setDetailsOpen(false)} /> : null}
    </main>
  );
}
