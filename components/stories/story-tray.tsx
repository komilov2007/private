"use client";

import { Plus, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/app/avatar";
import { createClient } from "@/lib/supabase/client";
import { CHAT_BUCKET, IMAGE_TYPES, MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, VIDEO_TYPES } from "@/lib/chat/constants";
import { safeFileName } from "@/lib/chat/helpers";
import type { Profile, Story } from "@/lib/chat/types";
import { loadActiveStories, type StoriesResult } from "@/lib/stories/queries";
import { useConversationRealtime } from "@/lib/realtime/use-conversation-realtime";
import { logSupabaseError } from "@/lib/supabase/errors";
import StoryViewer from "./story-viewer";
import StoryCreator from "./story-creator";
import { useBackHandler } from "@/lib/native/back-handler";

type Props = {
  userId: string;
  conversationId: string;
  me: Profile | null;
  other: Profile | null;
  otherName: string;
};

type Draft = { file: File; url: string };

export default function StoryTray({ userId, conversationId, me, other, otherName }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<StoriesResult | null>(null);
  const [viewing, setViewing] = useState<"mine" | "theirs" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => setReloadKey((value) => value + 1), 150);
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    void loadActiveStories(supabase, conversationId).then((next) => {
      if (active) setResult(next);
    });
    return () => {
      active = false;
    };
  }, [conversationId, reloadKey, supabase]);

  useEffect(() => () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
  }, []);

  // Story/like/view changes arrive through the shared hub's feature channel.
  useConversationRealtime(supabase, conversationId, userId, { onStoriesChanged: reload, onResync: reload });

  // Expire stories locally when their 24h window passes, without polling the server.
  const stories = useMemo(() => (result?.state === "ready" ? result.stories : []), [result]);
  useEffect(() => {
    if (!stories.length) return;
    const nextExpiry = Math.min(...stories.map((story) => new Date(story.expires_at).getTime()));
    const timer = setTimeout(reload, Math.max(1000, nextExpiry - Date.now() + 500));
    return () => clearTimeout(timer);
  }, [reload, stories]);

  // Oldest first inside the viewer, like every story player.
  const mine = useMemo(() => stories.filter((story) => story.owner_id === userId).reverse(), [stories, userId]);
  const theirs = useMemo(() => stories.filter((story) => story.owner_id !== userId).reverse(), [stories, userId]);
  const theirsUnseen = theirs.some((story) => !story.story_views?.some((view) => view.viewer_id === userId));
  const unavailable = result?.state === "unavailable";

  function pickFile(file: File | undefined) {
    if (!file) return;
    const isImage = IMAGE_TYPES.includes(file.type);
    const isVideo = VIDEO_TYPES.includes(file.type);
    if (!isImage && !isVideo) return setDraftError("Faqat rasm yoki video");
    if ((isImage && file.size > MAX_IMAGE_SIZE) || (isVideo && file.size > MAX_VIDEO_SIZE)) return setDraftError("Fayl juda katta");
    setDraftError("");
    setViewing(null);
    setDraft({ file, url: URL.createObjectURL(file) });
  }

  function closeDraft() {
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft(null);
    setDraftError("");
  }

  useBackHandler(Boolean(viewing), () => setViewing(null));
  useBackHandler(Boolean(draft), () => { if (!busy) closeDraft(); });

  async function publish(caption: string) {
    if (!draft || !conversationId) return;
    setBusy(true);
    setDraftError("");
    const path = `${conversationId}/${userId}/stories/${crypto.randomUUID()}-${safeFileName(draft.file.name)}`;
    const upload = await supabase.storage.from(CHAT_BUCKET).upload(path, draft.file, { contentType: draft.file.type, upsert: false });
    if (upload.error) {
      console.error("[stories] upload", { message: upload.error.message });
      setBusy(false);
      return setDraftError("Yuklab bo'lmadi. Qayta urinib ko'ring");
    }
    const insert = await supabase.from("stories").insert({
      owner_id: userId,
      conversation_id: conversationId,
      storage_path: path,
      media_type: draft.file.type.startsWith("video/") ? "video" : "image",
      caption: caption.trim() || null,
    });
    setBusy(false);
    if (insert.error) {
      logSupabaseError("[stories] insert", insert.error);
      await supabase.storage.from(CHAT_BUCKET).remove([path]);
      return setDraftError("Storis saqlanmadi");
    }
    closeDraft();
    reload();
  }

  const markSeen = useCallback((story: Story) => {
    if (story.owner_id === userId || story.story_views?.some((view) => view.viewer_id === userId)) return;
    const view = { story_id: story.id, viewer_id: userId, viewed_at: new Date().toISOString() };
    setResult((current) => current?.state === "ready"
      ? { ...current, stories: current.stories.map((item) => item.id === story.id ? { ...item, story_views: [...(item.story_views ?? []), view] } : item) }
      : current);
    // Insert-only: ON CONFLICT DO NOTHING needs no UPDATE policy.
    void supabase.from("story_views").upsert({ story_id: story.id, viewer_id: userId }, { onConflict: "story_id,viewer_id", ignoreDuplicates: true }).then(({ error }) => {
      if (error) logSupabaseError("[stories] mark viewed", error);
    });
  }, [supabase, userId]);

  async function toggleLike(story: Story) {
    const liked = story.story_likes?.some((like) => like.user_id === userId);
    const apply = (nextLiked: boolean) => setResult((current) => current?.state === "ready"
      ? { ...current, stories: current.stories.map((item) => item.id !== story.id ? item : {
        ...item,
        story_likes: nextLiked
          ? [...(item.story_likes ?? []).filter((like) => like.user_id !== userId), { user_id: userId, created_at: new Date().toISOString() }]
          : (item.story_likes ?? []).filter((like) => like.user_id !== userId),
      }) }
      : current);
    apply(!liked);
    const { error } = liked
      ? await supabase.from("story_likes").delete().eq("story_id", story.id).eq("user_id", userId)
      : await supabase.from("story_likes").upsert({ story_id: story.id, user_id: userId }, { onConflict: "story_id,user_id", ignoreDuplicates: true });
    if (error) {
      logSupabaseError("[stories] toggle like", error);
      apply(Boolean(liked));
    }
  }

  async function deleteStory(story: Story) {
    const { error } = await supabase.from("stories").delete().eq("id", story.id).eq("owner_id", userId);
    if (error) return logSupabaseError("[stories] delete", error);
    void supabase.storage.from(CHAT_BUCKET).remove([story.storage_path]);
    if (mine.length <= 1) setViewing(null);
    reload();
  }

  const loading = result === null;

  return (
    <>
      <div className="story-row" aria-busy={loading}>
        <div className="story-item">
          <button type="button" className="story-avatar-button" onClick={() => (mine.length ? setViewing("mine") : inputRef.current?.click())} disabled={unavailable} aria-label={mine.length ? "Mening storisimni ko'rish" : "Storis qo'shish"}>
            <span className="story-ring" data-state={mine.length ? "own" : "none"}>
              <Avatar profile={me} size="lg" />
            </span>
          </button>
          <button type="button" className="story-plus" onClick={() => inputRef.current?.click()} disabled={unavailable} aria-label="Yangi storis"><Plus size={14} strokeWidth={3} /></button>
          <span className="story-label">Mening storisim</span>
        </div>

        {loading ? (
          <div className="story-item" aria-hidden="true"><span className="skeleton h-[4.5rem] w-[4.5rem] rounded-full" /><span className="skeleton mt-2 h-2.5 w-12 rounded-full" /></div>
        ) : (
          <div className="story-item">
            <button type="button" className="story-avatar-button" onClick={() => theirs.length && setViewing("theirs")} disabled={!theirs.length} aria-label={theirs.length ? `${otherName} storisini ko'rish` : `${otherName}da faol storis yo'q`}>
              <span className="story-ring" data-state={theirs.length ? (theirsUnseen ? "unseen" : "seen") : "none"}>
                <Avatar profile={other} size="lg" />
              </span>
            </button>
            <span className="story-label" data-muted={!theirs.length || undefined}>{otherName}</span>
          </div>
        )}

        {unavailable ? <p className="muted self-center text-xs leading-5">Storislar tez orada<br />ishga tushadi</p> : null}
        {result?.state === "error" ? (
          <button type="button" onClick={reload} className="muted flex items-center gap-1.5 self-center text-xs"><RotateCw size={13} /> Qayta urinish</button>
        ) : null}
        {!loading && !unavailable && !theirs.length && !mine.length ? <p className="muted self-center text-xs leading-5">Birinchi lahzani<br />ulashing ✨</p> : null}
      </div>
      {draftError && !draft ? <p className="mx-5 -mt-1 mb-2 text-xs text-[var(--danger)]">{draftError}</p> : null}

      <input ref={inputRef} type="file" accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")} className="hidden" onChange={(event) => { pickFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />

      {viewing ? (
        <StoryViewer
          key={viewing}
          stories={viewing === "mine" ? mine : theirs}
          startIndex={viewing === "theirs" ? Math.max(0, theirs.findIndex((story) => !story.story_views?.some((view) => view.viewer_id === userId))) : 0}
          owner={viewing === "mine" ? me : other}
          ownerName={viewing === "mine" ? (me?.display_name ?? "Men") : otherName}
          viewerName={otherName}
          userId={userId}
          onClose={() => setViewing(null)}
          onSeen={markSeen}
          onToggleLike={(story) => void toggleLike(story)}
          onDelete={(story) => void deleteStory(story)}
          onAdd={() => inputRef.current?.click()}
        />
      ) : null}
      {draft ? <StoryCreator file={draft.file} previewUrl={draft.url} busy={busy} error={draftError} onCancel={closeDraft} onPublish={(caption) => void publish(caption)} /> : null}
    </>
  );
}
