"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAvatar } from "./messages";
import type { Profile } from "./types";
import { isMissingSchemaError, logSupabaseError } from "@/lib/supabase/errors";

export type ConversationContext = {
  state: "loading" | "ready" | "error" | "empty";
  conversationId: string;
  me: Profile | null;
  other: Profile | null;
  nickname: string;
};

const INITIAL: ConversationContext = { state: "loading", conversationId: "", me: null, other: null, nickname: "" };

/** Explicit staged queries only (no conversation_members -> profiles embedding). */
async function loadContext(supabase: SupabaseClient, userId: string): Promise<ConversationContext> {
  const membership = await supabase.from("conversation_members").select("conversation_id").eq("user_id", userId).limit(1).maybeSingle();
  if (membership.error) {
    logSupabaseError("[conversation] load membership", membership.error);
    return { ...INITIAL, state: "error" };
  }
  if (!membership.data) return { ...INITIAL, state: "empty" };
  const conversationId = String(membership.data.conversation_id);

  const members = await supabase.from("conversation_members").select("user_id").eq("conversation_id", conversationId);
  if (members.error) {
    logSupabaseError("[conversation] load members", members.error);
    return { ...INITIAL, conversationId, state: "error" };
  }
  const otherId = (members.data ?? []).map((row) => String(row.user_id)).find((id) => id !== userId);
  if (!otherId) return { ...INITIAL, conversationId, state: "empty" };

  const [profiles, contact] = await Promise.all([
    supabase.from("profiles").select("*").in("id", [userId, otherId]),
    supabase.from("contacts").select("nickname").eq("owner_id", userId).eq("contact_id", otherId).maybeSingle(),
  ]);
  if (profiles.error) {
    logSupabaseError("[conversation] load profiles", profiles.error);
    return { ...INITIAL, conversationId, state: "error" };
  }
  // contacts arrives with migration 002; its absence must not break the conversation.
  if (contact.error && !isMissingSchemaError(contact.error)) logSupabaseError("[conversation] load nickname", contact.error);

  const rows = (profiles.data ?? []) as Profile[];
  const fallback = (id: string): Profile => ({ id, display_name: "Suhbatdosh", avatar_url: null, bio: null, last_seen_at: null, created_at: null, updated_at: null });
  const [me, other] = await Promise.all([
    resolveAvatar(supabase, rows.find((row) => row.id === userId) ?? fallback(userId)),
    resolveAvatar(supabase, rows.find((row) => row.id === otherId) ?? fallback(otherId)),
  ]);
  return { state: "ready", conversationId, me, other, nickname: contact.data?.nickname ?? "" };
}

export function useConversationContext(supabase: SupabaseClient, userId: string) {
  const [context, setContext] = useState<ConversationContext>(INITIAL);

  const reload = useCallback(async () => {
    setContext(await loadContext(supabase, userId));
  }, [supabase, userId]);

  useEffect(() => {
    let active = true;
    void loadContext(supabase, userId).then((next) => {
      if (active) setContext(next);
    });
    return () => {
      active = false;
    };
  }, [supabase, userId]);

  /** Apply a realtime `profiles` UPDATE (display name / avatar / bio / last seen). */
  const applyProfile = useCallback(async (row: Record<string, unknown>) => {
    const id = String(row.id ?? "");
    if (!id) return;
    const resolved = await resolveAvatar(supabase, row as unknown as Profile);
    setContext((current) => {
      if (current.me?.id === id) return { ...current, me: { ...current.me, ...resolved } };
      if (current.other?.id === id) return { ...current, other: { ...current.other, ...resolved } };
      return current;
    });
  }, [supabase]);

  const setNickname = useCallback((nickname: string) => setContext((current) => ({ ...current, nickname })), []);

  return { ...context, reload, applyProfile, setNickname };
}
