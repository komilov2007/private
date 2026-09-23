import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { normalizeMessage } from "@/lib/chat/messages";
import type { Message, MessageRead } from "@/lib/chat/types";
import { devLog } from "@/lib/supabase/errors";

/**
 * One shared realtime hub per (user, conversation), reused by Home and Chat.
 *
 * Channels are deliberately separated so a failure in one cannot silence the others:
 *  - `db-messages`: postgres_changes for `messages` + `message_reads` ONLY (published since 001).
 *  - `live`: presence + typing broadcast. Shared topic so both users meet on it.
 *  - `db-features`: profiles/stories/backgrounds (002). If 002 is missing, only this channel fails.
 *
 * Previously every binding lived on one channel. Postgres Changes subscriptions are created
 * server-side AFTER the join reply, so the channel still reported SUBSCRIBED (and presence/typing
 * kept working) while an invalid feature binding made the server reject ALL of that channel's
 * postgres_changes — message INSERTs never arrived until a page refresh reloaded history.
 */

export type HubStatus = "connecting" | "live" | "reconnecting" | "error";

export type HubListener = {
  onMessageInsert?: (message: Message) => void;
  onMessageUpdate?: (message: Message) => void;
  onMessageDeleteBatch?: (ids: string[]) => void;
  onRead?: (read: MessageRead) => void;
  onTyping?: (typing: boolean) => void;
  onPresence?: (otherOnline: boolean) => void;
  onStatus?: (status: HubStatus) => void;
  /** Fired after a reconnect or when the tab becomes visible again: fetch anything missed. */
  onResync?: () => void;
  onProfile?: (row: Record<string, unknown>) => void;
  onStoriesChanged?: () => void;
  onProposal?: (row: Record<string, unknown>) => void;
  onSettings?: (row: Record<string, unknown>) => void;
  onHistoryClear?: (row: Record<string, unknown>) => void;
};

type Hub = {
  key: string;
  conversationId: string;
  userId: string;
  supabase: SupabaseClient;
  listeners: Set<HubListener>;
  channels: RealtimeChannel[];
  live: RealtimeChannel | null;
  status: HubStatus;
  wasLive: boolean;
  otherOnline: boolean;
  otherTyping: boolean;
  typingTimer: ReturnType<typeof setTimeout> | null;
  teardownTimer: ReturnType<typeof setTimeout> | null;
  lastTypingSent: number;
  typingState: boolean;
  disposed: boolean;
  cleanupDom: (() => void) | null;
  deleteQueue: Set<string>;
  deleteTimer: ReturnType<typeof setTimeout> | null;
};

const hubs = new Map<string, Hub>();
const TEARDOWN_DELAY_MS = 2000;

function emit<K extends keyof HubListener>(hub: Hub, key: K, ...args: Parameters<NonNullable<HubListener[K]>>) {
  for (const listener of hub.listeners) {
    const fn = listener[key] as ((...a: typeof args) => void) | undefined;
    try {
      fn?.(...args);
    } catch (error) {
      console.error(`[realtime] listener ${String(key)} failed`, error);
    }
  }
}

function setStatus(hub: Hub, status: HubStatus) {
  if (hub.status === status) return;
  const recovered = status === "live" && hub.wasLive;
  hub.status = status;
  if (status === "live") hub.wasLive = true;
  emit(hub, "onStatus", status);
  if (recovered) emit(hub, "onResync");
}

function touchLastSeen(hub: Hub) {
  void hub.supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", hub.userId).then(({ error }) => {
    if (error) devLog("[realtime] last_seen update skipped", error.code);
  });
}

async function start(hub: Hub) {
  const { supabase, conversationId, userId } = hub;
  // Realtime must carry the user's JWT before Postgres Changes are joined, otherwise the
  // server evaluates RLS as `anon` and silently delivers nothing.
  const { data: { session }, error } = await supabase.auth.getSession();
  if (hub.disposed) return;
  if (error || !session) {
    console.error("[realtime] no authenticated session", { message: error?.message ?? "missing session" });
    setStatus(hub, "error");
    return;
  }
  await supabase.realtime.setAuth(session.access_token);
  if (hub.disposed) return;
  devLog("[realtime] auth ready");
  devLog("[realtime] creating channel");
  devLog("[realtime] conversation:", conversationId);

  const nonce = Math.random().toString(36).slice(2, 10);

  // 1. Messages. Unfiltered on purpose: RLS limits rows to this user's conversation and the
  // server-side `conversation_id=eq.` filter proved unreliable before. Filter in app code.
  const messages = supabase
    .channel(`db-messages:${conversationId}:${nonce}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: string })?.id;
        if (id) hub.deleteQueue.add(String(id));
        if (!hub.deleteTimer) hub.deleteTimer = setTimeout(() => {
          const ids = [...hub.deleteQueue]; hub.deleteQueue.clear(); hub.deleteTimer = null;
          if (ids.length) emit(hub, "onMessageDeleteBatch", ids);
        }, 50);
        return;
      }
      const row = normalizeMessage(payload.new as Record<string, unknown>);
      if (row.conversation_id !== conversationId) return;
      if (payload.eventType === "INSERT") {
        devLog("[realtime] message INSERT:", row.id);
        emit(hub, "onMessageInsert", row);
      } else {
        devLog("[realtime] message UPDATE:", row.id);
        emit(hub, "onMessageUpdate", row);
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "message_reads" }, (payload) => {
      const row = payload.new as Partial<MessageRead> | null;
      if (!row?.message_id || !row.user_id) return;
      emit(hub, "onRead", { message_id: String(row.message_id), user_id: String(row.user_id), read_at: row.read_at ?? null });
    })
    .on("system", {}, (payload: { status?: string; extension?: string; message?: string }) => {
      if (payload?.extension !== "postgres_changes") return;
      if (payload.status === "ok") devLog("[realtime] postgres_changes ready (messages)");
      else {
        console.error("[realtime] messages postgres_changes rejected", { message: payload.message ?? null });
        setStatus(hub, "error");
      }
    })
    .subscribe((status, err) => {
      devLog("[realtime] status:", status);
      if (status === "SUBSCRIBED") setStatus(hub, "live");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (err) console.error("[realtime] messages channel", { status, message: err.message });
        setStatus(hub, "reconnecting");
      } else if (status === "CLOSED" && !hub.disposed) setStatus(hub, "reconnecting");
    });
  hub.channels.push(messages);

  // 2. Presence + typing. Topic must be identical for both users; clear any leftover
  // instance first because `supabase.channel()` returns an existing same-topic channel.
  const liveTopic = `live:${conversationId}`;
  for (const stale of supabase.getChannels().filter((channel) => channel.topic === `realtime:${liveTopic}`)) {
    await supabase.removeChannel(stale);
  }
  if (hub.disposed) return;
  const live = supabase.channel(liveTopic, { config: { presence: { key: userId }, broadcast: { self: false } } });
  live
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (!payload || payload.userId === userId) return;
      hub.otherTyping = Boolean(payload.typing);
      emit(hub, "onTyping", hub.otherTyping);
      if (hub.typingTimer) clearTimeout(hub.typingTimer);
      if (hub.otherTyping) {
        hub.typingTimer = setTimeout(() => {
          hub.otherTyping = false;
          emit(hub, "onTyping", false);
        }, 3000);
      }
    })
    .on("presence", { event: "sync" }, () => {
      hub.otherOnline = Object.keys(live.presenceState()).some((key) => key !== userId);
      emit(hub, "onPresence", hub.otherOnline);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") await live.track({ userId, at: new Date().toISOString() });
    });
  hub.live = live;
  hub.channels.push(live);

  // 3. Feature tables from migration 002. Isolated: an error here never affects messages.
  const features = supabase
    .channel(`db-features:${conversationId}:${nonce}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => emit(hub, "onProfile", payload.new as Record<string, unknown>))
    .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => emit(hub, "onStoriesChanged"))
    .on("postgres_changes", { event: "*", schema: "public", table: "story_views" }, () => emit(hub, "onStoriesChanged"))
    .on("postgres_changes", { event: "*", schema: "public", table: "story_likes" }, () => emit(hub, "onStoriesChanged"))
    .on("postgres_changes", { event: "*", schema: "public", table: "background_proposals" }, (payload) => {
      const row = payload.new as Record<string, unknown>;
      if (row?.conversation_id === conversationId) emit(hub, "onProposal", row);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "conversation_settings" }, (payload) => {
      const row = payload.new as Record<string, unknown>;
      if (row?.conversation_id === conversationId) emit(hub, "onSettings", row);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, (payload) => {
      const row = payload.new as Record<string, unknown>;
      if (row?.id === conversationId && row.history_cleared_at) emit(hub, "onHistoryClear", row);
    })
    .on("system", {}, (payload: { status?: string; extension?: string; message?: string }) => {
      if (payload?.extension === "postgres_changes" && payload.status !== "ok") {
        console.warn("[realtime] feature tables unavailable (is migration 002 applied?)", { message: payload.message ?? null });
      }
    })
    .subscribe();
  hub.channels.push(features);

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      touchLastSeen(hub);
      emit(hub, "onResync");
    } else touchLastSeen(hub);
  };
  const onOnline = () => emit(hub, "onResync");
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  hub.cleanupDom = () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
  };
  touchLastSeen(hub);
}

function teardown(hub: Hub) {
  hub.disposed = true;
  hubs.delete(hub.key);
  hub.cleanupDom?.();
  if (hub.typingTimer) clearTimeout(hub.typingTimer);
  if (hub.deleteTimer) clearTimeout(hub.deleteTimer);
  touchLastSeen(hub);
  devLog("[realtime] removing channels for conversation:", hub.conversationId);
  void hub.live?.untrack();
  for (const channel of hub.channels) void hub.supabase.removeChannel(channel);
  hub.channels = [];
}

export type HubHandle = { leave: () => void; sendTyping: (typing: boolean) => void };

export function joinConversation(supabase: SupabaseClient, conversationId: string, userId: string, listener: HubListener): HubHandle {
  const key = `${userId}:${conversationId}`;
  let hub = hubs.get(key);
  if (!hub) {
    hub = {
      key, conversationId, userId, supabase,
      listeners: new Set(), channels: [], live: null,
      status: "connecting", wasLive: false, otherOnline: false, otherTyping: false,
      typingTimer: null, teardownTimer: null, lastTypingSent: 0, typingState: false,
      disposed: false, cleanupDom: null, deleteQueue: new Set(), deleteTimer: null,
    };
    hubs.set(key, hub);
    void start(hub);
  }
  const current = hub;
  if (current.teardownTimer) {
    clearTimeout(current.teardownTimer);
    current.teardownTimer = null;
  }
  current.listeners.add(listener);
  // Late joiners (e.g. Chat opened from Home) get current state immediately.
  listener.onStatus?.(current.status);
  listener.onPresence?.(current.otherOnline);
  listener.onTyping?.(current.otherTyping);

  return {
    leave() {
      current.listeners.delete(listener);
      if (current.listeners.size || current.disposed) return;
      // Delay so StrictMode double-mount and Home <-> Chat navigation reuse the same channels.
      current.teardownTimer = setTimeout(() => teardown(current), TEARDOWN_DELAY_MS);
    },
    sendTyping(typing) {
      const now = Date.now();
      if (typing && current.typingState && now - current.lastTypingSent < 1500) return;
      if (!typing && !current.typingState) return;
      current.typingState = typing;
      current.lastTypingSent = now;
      void current.live?.send({ type: "broadcast", event: "typing", payload: { userId, typing } });
    },
  };
}
