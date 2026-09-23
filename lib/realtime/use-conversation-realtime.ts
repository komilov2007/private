"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { joinConversation, type HubHandle, type HubListener, type HubStatus } from "./conversation-hub";

/**
 * Subscribes a component to the shared conversation hub.
 * The latest `listener` is read through a ref, so the subscription is created once per
 * (conversation, user) and is never torn down because component state changed.
 */
export function useConversationRealtime(supabase: SupabaseClient, conversationId: string, userId: string, listener: HubListener) {
  const listenerRef = useRef(listener);
  const handleRef = useRef<HubHandle | null>(null);
  const [status, setStatus] = useState<HubStatus>("connecting");
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    listenerRef.current = listener;
  });

  useEffect(() => {
    if (!conversationId || !userId) return;
    const proxy: HubListener = {
      onMessageInsert: (message) => listenerRef.current.onMessageInsert?.(message),
      onMessageUpdate: (message) => listenerRef.current.onMessageUpdate?.(message),
      onMessageDeleteBatch: (ids) => listenerRef.current.onMessageDeleteBatch?.(ids),
      onRead: (read) => listenerRef.current.onRead?.(read),
      onTyping: (value) => {
        setTyping(value);
        listenerRef.current.onTyping?.(value);
      },
      onPresence: (value) => {
        setOnline(value);
        listenerRef.current.onPresence?.(value);
      },
      onStatus: (value) => {
        setStatus(value);
        listenerRef.current.onStatus?.(value);
      },
      onResync: () => listenerRef.current.onResync?.(),
      onProfile: (row) => listenerRef.current.onProfile?.(row),
      onStoriesChanged: () => listenerRef.current.onStoriesChanged?.(),
      onProposal: (row) => listenerRef.current.onProposal?.(row),
      onSettings: (row) => listenerRef.current.onSettings?.(row),
      onHistoryClear: (row) => listenerRef.current.onHistoryClear?.(row),
    };
    const handle = joinConversation(supabase, conversationId, userId, proxy);
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.leave();
    };
  }, [conversationId, supabase, userId]);

  const sendTyping = useCallback((value: boolean) => handleRef.current?.sendTyping(value), []);

  return { status, online, typing, sendTyping };
}
