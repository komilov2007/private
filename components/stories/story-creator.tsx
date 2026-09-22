"use client";
/* eslint-disable @next/next/no-img-element -- local object URL preview. */

import { Loader2, Send, X } from "lucide-react";
import { useState } from "react";

type Props = {
  file: File;
  previewUrl: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onPublish: (caption: string) => void;
};

export default function StoryCreator({ file, previewUrl, busy, error, onCancel, onPublish }: Props) {
  const [caption, setCaption] = useState("");
  const isVideo = file.type.startsWith("video/");

  return (
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label="Yangi storis">
      <div className="story-stage">
        {isVideo ? <video src={previewUrl} autoPlay muted loop playsInline className="story-media" /> : <img src={previewUrl} alt="Storis ko'rinishi" className="story-media" />}
        <div className="story-scrim-top" />
        <div className="story-scrim-bottom" />
        <div className="story-top z-20 flex items-center justify-between">
          <p className="text-sm font-semibold">Yangi storis</p>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Bekor qilish" className="story-chip"><X size={19} /></button>
        </div>
        <form
          className="story-bottom z-20"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onPublish(caption);
          }}
        >
          {error ? <p className="mb-2 rounded-xl bg-red-500/25 px-3 py-2 text-sm text-white">{error}</p> : null}
          <div className="flex items-end gap-2">
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={200}
              rows={1}
              placeholder="Izoh qo'shing…"
              className="max-h-28 min-h-12 flex-1 resize-none rounded-2xl border border-white/20 bg-black/35 px-4 py-3 text-[16px] text-white outline-none backdrop-blur-md placeholder:text-white/60 focus:border-white/50"
            />
            <button type="submit" disabled={busy} aria-label="Joylash" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white shadow-lg disabled:opacity-60">
              {busy ? <Loader2 size={20} className="animate-spin" /> : <Send size={19} />}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-white/60">24 soat davomida ko&apos;rinadi</p>
        </form>
      </div>
    </div>
  );
}
