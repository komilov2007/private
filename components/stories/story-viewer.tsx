"use client";
/* eslint-disable @next/next/no-img-element -- private signed Storage URLs cannot use the Next image optimizer. */

import { Eye, Heart, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@/components/app/avatar";
import type { Profile, Story } from "@/lib/chat/types";

const IMAGE_DURATION_MS = 5500;

type Props = {
  stories: Story[];
  startIndex?: number;
  owner: Profile | null;
  ownerName: string;
  viewerName: string;
  userId: string;
  onClose: () => void;
  onSeen: (story: Story) => void;
  onToggleLike: (story: Story) => void;
  onDelete: (story: Story) => void;
  onAdd?: () => void;
};

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "hozirgina";
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  return `${Math.floor(minutes / 60)} soat oldin`;
}

export default function StoryViewer({ stories, startIndex = 0, owner, ownerName, viewerName, userId, onClose, onSeen, onToggleLike, onDelete, onAdd }: Props) {
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, stories.length - 1)));
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const story = stories[Math.min(index, stories.length - 1)];
  const mine = story?.owner_id === userId;
  const liked = story?.story_likes?.some((like) => like.user_id === userId) ?? false;
  const onSeenRef = useRef(onSeen);
  const onCloseRef = useRef(onClose);
  const indexRef = useRef(index);
  const progressRef = useRef(0);

  useEffect(() => {
    onSeenRef.current = onSeen;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (story) onSeenRef.current(story);
  }, [story]);

  const go = useCallback((delta: number) => {
    const next = indexRef.current + delta;
    if (next >= stories.length) {
      onCloseRef.current();
      return;
    }
    indexRef.current = Math.max(0, next);
    progressRef.current = 0;
    setProgress(0);
    setIndex(indexRef.current);
  }, [stories.length]);

  // Auto-advance for images (videos advance on `ended`). Resumes from the paused position.
  useEffect(() => {
    if (!story || story.media_type !== "image" || paused) return;
    const startedAt = Date.now();
    const base = progressRef.current;
    const timer = window.setInterval(() => {
      const next = base + (Date.now() - startedAt) / IMAGE_DURATION_MS;
      if (next >= 1) {
        window.clearInterval(timer);
        go(1);
        return;
      }
      progressRef.current = next;
      setProgress(next);
    }, 50);
    return () => window.clearInterval(timer);
  }, [go, paused, story]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [go]);

  if (!story) return null;
  const views = story.story_views?.filter((view) => view.viewer_id !== story.owner_id) ?? [];
  const mediaBroken = broken[story.id] || !story.signedUrl;

  return (
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`${ownerName} storisi`}>
      <div className="story-stage">
        {mediaBroken ? (
          <div className="grid h-full w-full place-items-center px-8 text-center text-sm text-white/70">Storisni yuklab bo&apos;lmadi</div>
        ) : story.media_type === "image" ? (
          <img key={story.id} src={story.signedUrl} alt={story.caption ?? "Storis"} className="story-media" onError={() => setBroken((value) => ({ ...value, [story.id]: true }))} />
        ) : (
          <video
            key={story.id}
            ref={videoRef}
            src={story.signedUrl}
            autoPlay
            playsInline
            className="story-media"
            onTimeUpdate={(event) => { const el = event.currentTarget; if (el.duration) setProgress(el.currentTime / el.duration); }}
            onEnded={() => go(1)}
            onError={() => setBroken((value) => ({ ...value, [story.id]: true }))}
          />
        )}

        <div className="story-scrim-top" />
        <div className="story-scrim-bottom" />

        {/* Tap zones: left = previous, right = next; hold to pause. */}
        <button
          type="button"
          aria-label="Oldingi"
          className="absolute inset-y-0 left-0 z-10 w-1/3"
          onClick={() => go(-1)}
          onPointerDown={() => { setPaused(true); videoRef.current?.pause(); }}
          onPointerUp={() => { setPaused(false); void videoRef.current?.play(); }}
          onPointerLeave={() => setPaused(false)}
        />
        <button
          type="button"
          aria-label="Keyingi"
          className="absolute inset-y-0 right-0 z-10 w-2/3"
          onClick={() => go(1)}
          onPointerDown={() => { setPaused(true); videoRef.current?.pause(); }}
          onPointerUp={() => { setPaused(false); void videoRef.current?.play(); }}
          onPointerLeave={() => setPaused(false)}
        />

        <div className="story-top z-20">
          <div className="flex gap-1">
            {stories.map((item, itemIndex) => (
              <span key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <span className="block h-full rounded-full bg-white" style={{ width: `${itemIndex < index ? 100 : itemIndex === index ? progress * 100 : 0}%` }} />
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Avatar profile={owner} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{mine ? "Mening storisim" : ownerName}</p>
              <p className="text-[11px] text-white/70">{relativeTime(story.created_at)}</p>
            </div>
            {mine && onAdd ? <button type="button" onClick={onAdd} aria-label="Yangi storis" className="story-chip"><Plus size={18} /></button> : null}
            {mine ? <button type="button" onClick={() => onDelete(story)} aria-label="Storisni o'chirish" className="story-chip"><Trash2 size={17} /></button> : null}
            <button type="button" onClick={onClose} aria-label="Yopish" className="story-chip"><X size={19} /></button>
          </div>
        </div>

        <div className="story-bottom z-20">
          {story.caption ? <p className="mb-3 text-[15px] leading-6 text-white [text-shadow:0_1px_8px_rgba(0,0,0,.45)]">{story.caption}</p> : null}
          <div className="flex items-center justify-between gap-3">
            {mine ? (
              <p className="flex items-center gap-2 text-xs text-white/80">
                <Eye size={15} />
                {views.length ? `${viewerName} ko'rdi` : "Hali ko'rilmagan"}
                {story.story_likes?.length ? <span className="flex items-center gap-1 text-rose-300"><Heart size={13} fill="currentColor" /> yoqdi</span> : null}
              </p>
            ) : <span />}
            {!mine ? (
              <button type="button" onClick={() => onToggleLike(story)} aria-pressed={liked} aria-label={liked ? "Yoqtirishni bekor qilish" : "Yoqdi"} className="story-like" data-liked={liked || undefined}>
                <Heart size={22} fill={liked ? "currentColor" : "none"} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
