import type { SupabaseClient } from "@supabase/supabase-js";
import { signStoragePaths } from "@/lib/chat/messages";
import type { Story } from "@/lib/chat/types";
import { isMissingSchemaError, logSupabaseError } from "@/lib/supabase/errors";

export type StoriesResult =
  | { state: "ready"; stories: Story[] }
  | { state: "unavailable" } // migration 002 not applied
  | { state: "error" };

type ViewRow = { story_id: string; viewer_id: string; viewed_at: string };
type LikeRow = { story_id: string; user_id: string; created_at: string };

/**
 * Staged explicit queries instead of `stories -> story_views/story_likes` embedding,
 * so basic story rendering never depends on PostgREST relationship detection.
 */
export async function loadActiveStories(supabase: SupabaseClient, conversationId: string): Promise<StoriesResult> {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("conversation_id", conversationId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError("[stories] load", error);
    return isMissingSchemaError(error) ? { state: "unavailable" } : { state: "error" };
  }

  const rows = (data ?? []) as Story[];
  if (!rows.length) return { state: "ready", stories: [] };
  const storyIds = rows.map((story) => story.id);

  const [views, likes, urls] = await Promise.all([
    supabase.from("story_views").select("*").in("story_id", storyIds),
    supabase.from("story_likes").select("*").in("story_id", storyIds),
    signStoragePaths(supabase, rows.map((story) => story.storage_path), 3600),
  ]);
  // Views/likes failing only degrades counters; stories still render.
  if (views.error) logSupabaseError("[stories] load views", views.error);
  if (likes.error) logSupabaseError("[stories] load likes", likes.error);

  const viewsByStory = new Map<string, ViewRow[]>();
  for (const view of (views.data ?? []) as ViewRow[]) viewsByStory.set(view.story_id, [...(viewsByStory.get(view.story_id) ?? []), view]);
  const likesByStory = new Map<string, LikeRow[]>();
  for (const like of (likes.data ?? []) as LikeRow[]) likesByStory.set(like.story_id, [...(likesByStory.get(like.story_id) ?? []), like]);

  return {
    state: "ready",
    stories: rows.map((story) => ({
      ...story,
      signedUrl: urls.get(story.storage_path),
      story_views: viewsByStory.get(story.id) ?? [],
      story_likes: likesByStory.get(story.id) ?? [],
    })),
  };
}
