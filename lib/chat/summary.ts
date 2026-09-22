import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeMessage } from "./messages";
import type { Message } from "./types";
import { logSupabaseError } from "@/lib/supabase/errors";

export type ConversationSummary = { last: Message | null; unread: number; lastRead: boolean };

const UNREAD_WINDOW = 100;

/**
 * Last message + unread count from real read receipts (staged queries, no embedding):
 * the other user's recent non-deleted messages minus the ones this user has a read row for.
 */
export async function loadConversationSummary(supabase: SupabaseClient, conversationId: string, userId: string): Promise<ConversationSummary | null> {
  const [lastResult, incomingResult] = await Promise.all([
    supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("messages")
      .select("id,type")
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(UNREAD_WINDOW),
  ]);
  if (lastResult.error || incomingResult.error) {
    logSupabaseError("[home] load summary", lastResult.error ?? incomingResult.error);
    return null;
  }

  const incomingIds = (incomingResult.data ?? []).filter((row) => row.type !== "system").map((row) => String(row.id));
  let unread = 0;
  if (incomingIds.length) {
    const reads = await supabase.from("message_reads").select("message_id").eq("user_id", userId).in("message_id", incomingIds);
    if (reads.error) {
      logSupabaseError("[home] load reads", reads.error);
    } else {
      const readIds = new Set((reads.data ?? []).map((row) => String(row.message_id)));
      unread = incomingIds.filter((id) => !readIds.has(id)).length;
    }
  }

  const last = lastResult.data ? normalizeMessage(lastResult.data as Record<string, unknown>) : null;
  let lastRead = false;
  if (last && last.sender_id === userId) {
    const receipt = await supabase.from("message_reads").select("message_id").eq("message_id", last.id).neq("user_id", userId).limit(1);
    lastRead = Boolean(receipt.data?.length);
  }

  return { last, unread, lastRead };
}
