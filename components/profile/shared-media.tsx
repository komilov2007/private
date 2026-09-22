"use client";
/* eslint-disable @next/next/no-img-element */

import { ArrowLeft, File, ImageIcon, Mic, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Attachment, Message } from "@/lib/chat/types";
import VoicePlayer from "@/components/chat/voice-player";
import BottomNav from "@/components/app/bottom-nav";

type Item = Attachment & { message?: Message };
const tabs = [{ id: "image", label: "Media", icon: ImageIcon }, { id: "video", label: "Video", icon: Video }, { id: "voice", label: "Ovoz", icon: Mic }, { id: "file", label: "Fayl", icon: File }] as const;

export default function SharedMedia({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("image");
  useEffect(() => { void supabase.from("conversation_members").select("conversation_id").eq("user_id", userId).limit(1).single().then(async ({ data }) => { if (!data) return; const messages = await supabase.from("messages").select("*").eq("conversation_id", data.conversation_id).is("deleted_at", null).order("created_at", { ascending: false }); const rows = (messages.data ?? []) as Message[]; const ids = rows.map((message) => message.id); if (!ids.length) return; const attachments = await supabase.from("message_attachments").select("*").in("message_id", ids); const signed = await supabase.storage.from("chat-media").createSignedUrls((attachments.data ?? []).map((item) => item.storage_path), 3600); const urls = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl])); setItems((attachments.data ?? []).map((item) => ({ ...item, signedUrl: urls.get(item.storage_path), message: rows.find((message) => message.id === item.message_id) })) as Item[]); }); }, [supabase, userId]);
  const visible = items.filter((item) => tab === "voice" ? item.message?.type === "voice" : tab === "image" ? item.message?.type === "image" : tab === "video" ? item.message?.type === "video" : !["image", "video", "voice"].includes(item.message?.type ?? ""));
  return <div className="home-shell"><main className="relative mx-auto max-w-3xl px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))]"><div><header className="mb-5 flex items-center gap-3"><Link href="/" className="icon-button" aria-label="Asosiyga qaytish"><ArrowLeft /></Link><div><h1 className="text-xl font-bold">Umumiy media</h1><p className="muted text-sm">Suhbatda yuborilgan fayllar</p></div></header><div className="theme-segment mb-5">{tabs.map(({ id, label, icon: Icon }) => <button key={id} data-active={tab === id} onClick={() => setTab(id)}><Icon size={15}/><span>{label}</span></button>)}</div>{visible.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{visible.map((item) => <div key={item.id} className="app-panel overflow-hidden rounded-xl">{item.message?.type === "image" ? <>{/* Private signed URL. */}<img src={item.signedUrl ?? undefined} alt={item.file_name ?? "Rasm"} className="aspect-square w-full object-cover" /></> : item.message?.type === "video" ? <video src={item.signedUrl ?? undefined} controls className="aspect-square w-full object-cover" /> : item.message?.type === "voice" ? <div className="p-3"><VoicePlayer attachment={item} /></div> : <a href={item.signedUrl ?? undefined} className="flex min-h-28 items-center justify-center p-3 text-sm">{item.file_name}</a>}</div>)}</div> : <div className="app-panel rounded-2xl p-10 text-center"><p className="font-bold">Hozircha bo&apos;sh</p><p className="muted mt-1 text-sm">Yuborilgan fayllar shu yerda ko&apos;rinadi</p></div>}</div></main><BottomNav /></div>;
}
