"use client";

import { ImageIcon, UserPen, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Avatar from "@/components/app/avatar";
import type { Profile } from "@/lib/chat/types";
import { lastSeenLabel } from "@/lib/chat/helpers";

type Props = {
  profile: Profile | null;
  name: string;
  online: boolean;
  nickname: string;
  onSaveNickname: (value: string) => Promise<void>;
  onClose: () => void;
};

export default function ContactDetails({ profile, name, online, nickname, onSaveNickname, onClose }: Props) {
  const [value, setValue] = useState(nickname);
  const [saving, setSaving] = useState(false);
  return (
    <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="bottom-sheet p-5" role="dialog" aria-label={`${name} haqida`}>
        <div className="flex justify-end"><button type="button" className="icon-button" onClick={onClose} aria-label="Yopish"><X /></button></div>
        <div className="text-center">
          <span className="story-ring mx-auto" data-state="seen"><Avatar profile={profile} size="xl" /></span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">{name}</h2>
          {nickname && profile?.display_name && nickname !== profile.display_name ? <p className="muted text-sm">Profil nomi: {profile.display_name}</p> : null}
          <p className={`mt-1 text-sm ${online ? "text-emerald-500" : "muted"}`}>{online ? "Onlayn" : lastSeenLabel(profile?.last_seen_at ?? null) || "Oflayn"}</p>
          {profile?.bio ? <p className="mx-auto mt-3 max-w-sm text-sm leading-6">{profile.bio}</p> : null}
        </div>
        <div className="mt-6 rounded-2xl bg-[var(--surface-elevated)] p-4">
          <label className="block text-xs font-semibold">
            Shaxsiy nom <span className="muted font-normal">· faqat siz ko&apos;rasiz</span>
            <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={profile?.display_name} maxLength={48} className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] px-3 text-[16px] outline-none focus:border-[var(--accent)]" />
          </label>
          <button type="button" disabled={saving} onClick={async () => { setSaving(true); await onSaveNickname(value); setSaving(false); }} className="primary-button mt-3 w-full disabled:opacity-60">
            <UserPen size={17} />{nickname ? "Nomni saqlash" : "Kontaktga nom berish"}
          </button>
        </div>
        <Link href="/media" className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--surface-elevated)] text-sm font-semibold"><ImageIcon size={17} /> Umumiy media</Link>
      </section>
    </div>
  );
}
