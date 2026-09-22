import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_BUCKET } from "./constants";
import type { Attachment, Message, MessageRead, Profile } from "./types";
import { logSupabaseError } from "@/lib/supabase/errors";

const str = (value: unknown) => (typeof value === "string" ? value : null);

/** Normalizes a raw `messages` row (REST result or Realtime payload.new). Enrichment fields are left undefined. */
export function normalizeMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    sender_id: String(row.sender_id),
    type: row.type as Message["type"],
    content: str(row.content),
    reply_to_id: str(row.reply_to_id),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
    edited_at: str(row.edited_at),
    deleted_at: str(row.deleted_at),
  };
}

export function sortMessages(a: Message, b: Message) {
  return (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id);
}

/**
 * Inserts or merges one message by id. Only fields actually present on `incoming` overwrite,
 * so a bare Realtime row never wipes attachments/reads/reply that enrichment already added.
 */
export function upsertMessage(current: Message[], incoming: Message) {
  const index = current.findIndex((message) => message.id === incoming.id);
  if (index === -1) return [...current, incoming].sort(sortMessages);
  const defined = Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== undefined)) as Partial<Message>;
  const next = current.slice();
  next[index] = { ...current[index], ...defined };
  return next;
}

export function mergeRead(current: Message[], read: MessageRead) {
  const index = current.findIndex((message) => message.id === read.message_id);
  if (index === -1) return current;
  const message = current[index];
  if (message.message_reads?.some((item) => item.user_id === read.user_id)) return current;
  const next = current.slice();
  next[index] = { ...message, message_reads: [...(message.message_reads ?? []), read] };
  return next;
}

export function isValidStoragePath(path: unknown): path is string {
  return typeof path === "string" && path.trim().length > 0;
}

/** Signs many private storage paths; a failure for one path never fails the others. */
export async function signStoragePaths(supabase: SupabaseClient, paths: unknown[], expiresIn = 3600) {
  const unique = [...new Set(paths.filter(isValidStoragePath))];
  const urls = new Map<string, string>();
  if (!unique.length) return urls;
  const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrls(unique, expiresIn);
  if (error) {
    console.error("[storage] sign urls", { message: error.message, count: unique.length });
    return urls;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

const avatarCache = new Map<string, { url: string; expiresAt: number }>();

export async function resolveAvatar(supabase: SupabaseClient, profile: Profile): Promise<Profile> {
  const path = profile.avatar_url;
  if (!path || /^https?:/.test(path)) return profile;
  const cached = avatarCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return { ...profile, avatar_url: cached.url };
  const urls = await signStoragePaths(supabase, [path]);
  const url = urls.get(path) ?? null;
  if (url) avatarCache.set(path, { url, expiresAt: Date.now() + 50 * 60 * 1000 });
  return { ...profile, avatar_url: url };
}

/**
 * Staged, explicit enrichment (no PostgREST embedding): attachments, reads and reply
 * targets are loaded with separate `.in()` queries and merged here.
 */
export async function hydrateMessages(supabase: SupabaseClient, rows: Message[]): Promise<Message[]> {
  if (!rows.length) return rows;
  const ids = rows.map((message) => message.id);
  const replyIds = [...new Set(rows.map((message) => message.reply_to_id).filter((id): id is string => Boolean(id)))];

  const [attachmentsResult, readsResult, repliesResult] = await Promise.all([
    supabase.from("message_attachments").select("*").in("message_id", ids),
    supabase.from("message_reads").select("*").in("message_id", ids),
    replyIds.length ? supabase.from("messages").select("*").in("id", replyIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (attachmentsResult.error) logSupabaseError("[chat] load attachments", attachmentsResult.error);
  if (readsResult.error) logSupabaseError("[chat] load reads", readsResult.error);
  if (repliesResult.error) logSupabaseError("[chat] load replies", repliesResult.error);

  const attachments = (attachmentsResult.data ?? []) as Attachment[];
  const urls = await signStoragePaths(supabase, attachments.map((item) => item.storage_path), 60 * 60);
  const attachmentsByMessage = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    const list = attachmentsByMessage.get(attachment.message_id) ?? [];
    list.push({ ...attachment, signedUrl: urls.get(attachment.storage_path) ?? null });
    attachmentsByMessage.set(attachment.message_id, list);
  }
  const readsByMessage = new Map<string, MessageRead[]>();
  for (const read of (readsResult.data ?? []) as MessageRead[]) {
    const list = readsByMessage.get(read.message_id) ?? [];
    list.push(read);
    readsByMessage.set(read.message_id, list);
  }
  const replies = new Map(((repliesResult.data ?? []) as Record<string, unknown>[]).map((row) => [String(row.id), normalizeMessage(row)]));

  return rows.map((message) => ({
    ...message,
    message_attachments: attachmentsResult.error ? message.message_attachments : attachmentsByMessage.get(message.id) ?? [],
    message_reads: readsResult.error ? message.message_reads : readsByMessage.get(message.id) ?? [],
    reply_to: message.reply_to_id ? replies.get(message.reply_to_id) ?? message.reply_to ?? null : null,
  }));
}

export function messagePreview(message: Message | null) {
  if (!message) return "";
  if (message.deleted_at) return "Xabar o'chirildi";
  switch (message.type) {
    case "image": return "📷 Rasm";
    case "video": return "🎬 Video";
    case "voice": return "🎤 Ovozli xabar";
    case "sticker": return "✨ Stiker";
    default: return message.content ?? "";
  }
}
