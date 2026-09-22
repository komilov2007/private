"use client";

import { ArrowLeft, Camera, Check, ImageIcon, Loader2, LogOut, Palette, PenLine, Save, Wallpaper, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/app/avatar";
import BottomNav from "@/components/app/bottom-nav";
import ThemeSelector from "@/components/app/theme-selector";
import { useTheme } from "@/components/app/theme-provider";
import { createClient } from "@/lib/supabase/client";
import { CHAT_BUCKET } from "@/lib/chat/constants";
import { resolveAvatar } from "@/lib/chat/messages";
import type { Profile } from "@/lib/chat/types";
import { isMissingSchemaError, logSupabaseError } from "@/lib/supabase/errors";
import { wallpapersFor } from "@/lib/wallpapers";

const timestamp = () => Date.now();

function readLocalBackgroundId(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return raw.startsWith("{") ? (JSON.parse(raw) as { id: string }).id : raw;
  } catch {
    return null;
  }
}

export default function ProfileScreen({ userId, email }: { userId: string; email: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { identity } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [background, setBackground] = useState<string | null>(null);
  const backgroundKey = `chat-background:${identity}`;

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("conversation_members").select("conversation_id").eq("user_id", userId).limit(1).maybeSingle(),
    ]).then(async ([profileResult, memberResult]) => {
      if (!active) return;
      setBackground(readLocalBackgroundId(backgroundKey));
      if (memberResult.error) logSupabaseError("[profile] load membership", memberResult.error);
      if (memberResult.data) setConversationId(String(memberResult.data.conversation_id));
      if (profileResult.error || !profileResult.data) {
        logSupabaseError("[profile] load", profileResult.error);
        return setNotice("Profilni yuklab bo'lmadi");
      }
      const next = await resolveAvatar(supabase, profileResult.data as Profile);
      if (!active) return;
      setProfile(next);
      setName(next.display_name);
      setBio(next.bio ?? "");
    });
    return () => {
      active = false;
    };
  }, [backgroundKey, supabase, userId]);

  async function saveProfile() {
    if (!name.trim()) return setNotice("Ism bo'sh bo'lmasin");
    setSaving(true);
    const payload: Record<string, string | null> = { display_name: name.trim(), updated_at: new Date().toISOString() };
    if (profile && "bio" in profile) payload.bio = bio.trim() || null;
    const { data, error } = await supabase.from("profiles").update(payload).eq("id", userId).select("*").single();
    setSaving(false);
    if (error || !data) {
      logSupabaseError("[profile] save", error);
      return setNotice(isMissingSchemaError(error) ? "Bio hali sozlanmagan" : "Saqlab bo'lmadi");
    }
    setProfile((current) => ({ ...(data as Profile), avatar_url: current?.avatar_url ?? null }));
    setEditing(false);
    setNotice("Saqlandi");
  }

  async function uploadAvatar(file: File) {
    if (!conversationId || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) return setNotice("Rasm mos emas (JPG/PNG/WebP, 8 MB gacha)");
    setSaving(true);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${conversationId}/${userId}/avatar/${crypto.randomUUID()}.${extension}`;
    const upload = await supabase.storage.from(CHAT_BUCKET).upload(path, file, { contentType: file.type });
    if (upload.error) {
      console.error("[profile] avatar upload", { message: upload.error.message });
      setSaving(false);
      return setNotice("Rasm yuklanmadi");
    }
    const update = await supabase.from("profiles").update({ avatar_url: path, updated_at: new Date().toISOString() }).eq("id", userId);
    setSaving(false);
    if (update.error) {
      logSupabaseError("[profile] avatar save", update.error);
      return setNotice("Rasm saqlanmadi");
    }
    const resolved = await resolveAvatar(supabase, { ...(profile as Profile), avatar_url: path });
    setProfile(resolved);
    setNotice("Avatar yangilandi");
  }

  function applyBackground(id: string) {
    try {
      localStorage.setItem(backgroundKey, JSON.stringify({ id, at: timestamp() }));
    } catch {
      // ignore
    }
    setBackground(id);
    setNotice("Chat foni tanlandi");
  }

  return (
    <div className="home-shell">
      <div className="home-glow" aria-hidden="true" />
      <main className="relative mx-auto max-w-xl px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="mb-4 flex items-center justify-between py-1">
          <Link href="/" className="icon-button" aria-label="Asosiyga qaytish"><ArrowLeft /></Link>
          <h1 className="text-[17px] font-semibold">Profil</h1>
          <button type="button" className="icon-button" aria-label="Chiqish" onClick={async () => { await supabase.auth.signOut(); window.location.replace("/login"); }}><LogOut size={20} /></button>
        </header>

        <section className="home-card overflow-hidden">
          <div className="profile-cover" />
          <div className="px-5 pb-5 text-center">
            <div className="relative mx-auto -mt-14 w-fit">
              <span className="story-ring" data-state="own">{profile ? <Avatar profile={profile} size="xl" /> : <span className="skeleton block h-28 w-28 rounded-full" />}</span>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={saving} className="absolute bottom-1 right-1 grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--surface-solid)] bg-[var(--accent)] text-white shadow-lg" aria-label="Avatarni almashtirish">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.currentTarget.value = ""; }} />
            </div>
            {editing ? (
              <div className="mt-5 space-y-3 text-left">
                <label className="block text-sm font-semibold">Ism
                  <input value={name} onChange={(event) => setName(event.target.value)} className="field mt-1" maxLength={48} />
                </label>
                <label className="block text-sm font-semibold">Bio
                  <textarea value={bio} onChange={(event) => setBio(event.target.value)} className="field mt-1 min-h-20 resize-none py-2.5" maxLength={160} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setEditing(false); setName(profile?.display_name ?? ""); setBio(profile?.bio ?? ""); }} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--surface-elevated)] text-sm font-semibold"><X size={16} /> Bekor</button>
                  <button type="button" onClick={() => void saveProfile()} disabled={saving} className="primary-button"><Save size={17} /> Saqlash</button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight">{profile?.display_name ?? "…"}</h2>
                <p className="muted mt-0.5 text-sm">{email}</p>
                {profile?.bio ? <p className="mx-auto mt-3 max-w-sm text-sm leading-6">{profile.bio}</p> : null}
                <button type="button" onClick={() => setEditing(true)} disabled={!profile} className="primary-button mt-5"><PenLine size={16} /> Profilni tahrirlash</button>
              </>
            )}
            {notice ? <p className="accent mt-3 text-sm" role="status"><Check className="mr-1 inline" size={14} />{notice}</p> : null}
          </div>
        </section>

        <section className="home-card mt-4 p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold"><Palette size={18} className="accent" /> Ko&apos;rinish</div>
          <ThemeSelector />
        </section>

        <section className="home-card mt-4 p-4">
          <div className="mb-1 flex items-center gap-2 font-semibold"><Wallpaper size={18} className="accent" /> Chat foni</div>
          <p className="muted mb-3 text-xs">Faqat siz uchun. Umumiy fonni suhbat ichidan taklif qiling.</p>
          <div className="grid grid-cols-4 gap-2">
            {wallpapersFor(identity).map((wallpaper) => (
              <button key={wallpaper.id} type="button" onClick={() => applyBackground(wallpaper.id)} aria-pressed={background === wallpaper.id} aria-label={wallpaper.name} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-[var(--border)]" style={{ background: wallpaper.css }}>
                {background === wallpaper.id ? <span className="absolute inset-0 grid place-items-center bg-black/25 text-white"><Check size={18} /></span> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="home-card mt-4 overflow-hidden">
          <Link href="/media" className="flex min-h-14 items-center gap-3 px-4"><ImageIcon className="accent" size={19} /><span className="font-medium">Umumiy media</span></Link>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
