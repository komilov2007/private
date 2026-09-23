"use client";

import { CheckCheck, Check, ChevronRight, LockKeyhole, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Avatar from "@/components/app/avatar";
import BottomNav from "@/components/app/bottom-nav";
import ThemeToggle from "@/components/app/theme-toggle";
import StoryTray from "@/components/stories/story-tray";
import { createClient } from "@/lib/supabase/client";
import { lastSeenLabel, listTimeLabel } from "@/lib/chat/helpers";
import { messagePreview } from "@/lib/chat/messages";
import { loadConversationSummary, type ConversationSummary } from "@/lib/chat/summary";
import { useConversationContext } from "@/lib/chat/use-conversation-context";
import { useConversationRealtime } from "@/lib/realtime/use-conversation-realtime";
import type { UserIdentity } from "@/lib/identity";

function greetingFor(hour: number) {
  if (hour >= 5 && hour < 11) return "Xayrli tong";
  if (hour >= 11 && hour < 17) return "Xayrli kun";
  if (hour >= 17 && hour < 22) return "Xayrli kech";
  return "Xayrli tun";
}

// Time-of-day greeting from the device clock; empty on the server so hydration never mismatches.
function subscribeClock(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  return () => window.clearInterval(timer);
}

export default function HomeScreen({ userId, identity }: { userId: string; identity: UserIdentity }) {
  const supabase = useMemo(() => createClient(), []);
  const context = useConversationContext(supabase, userId);
  const { conversationId, me, other, nickname, applyProfile } = context;
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greeting = useSyncExternalStore(subscribeClock, () => greetingFor(new Date().getHours()), () => "");

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => setReloadKey((value) => value + 1), 250);
  }, []);

  useEffect(() => () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    void loadConversationSummary(supabase, conversationId, userId).then((next) => {
      if (!active) return;
      setSummaryError(!next);
      if (next) setSummary(next);
    });
    return () => {
      active = false;
    };
  }, [conversationId, reloadKey, supabase, userId]);

  // Same shared hub as the chat: previews update instantly from realtime payloads.
  const realtime = useConversationRealtime(supabase, conversationId, userId, {
    onMessageInsert: (message) => {
      setSummary((current) => {
        const base = current ?? { last: null, unread: 0, lastRead: false };
        if (base.last && (base.last.id === message.id || (base.last.created_at ?? "") > (message.created_at ?? ""))) return base;
        const fromOther = message.sender_id !== userId && message.type !== "system";
        return { last: message, unread: base.unread + (fromOther ? 1 : 0), lastRead: false };
      });
    },
    onMessageUpdate: (message) => {
      setSummary((current) => (current?.last?.id === message.id ? { ...current, last: { ...current.last, ...message } } : current));
      if (message.deleted_at) scheduleReload();
    },
    onMessageDeleteBatch: scheduleReload,
    onRead: (read) => {
      if (read.user_id === userId) scheduleReload();
      else setSummary((current) => (current?.last?.id === read.message_id ? { ...current, lastRead: true } : current));
    },
    onResync: scheduleReload,
    onProfile: (row) => void applyProfile(row),
    onHistoryClear: () => setSummary({ last: null, unread: 0, lastRead: false }),
  });

  const firstName = me?.display_name?.split(" ")[0] ?? "";
  const otherName = nickname || other?.display_name || "Suhbatdosh";
  const last = summary?.last ?? null;
  const unread = summary?.unread ?? 0;
  const lastMine = last?.sender_id === userId;
  const statusLine = realtime.typing ? "yozmoqda…" : realtime.online ? "Onlayn" : lastSeenLabel(other?.last_seen_at ?? null);
  const ready = context.state === "ready";

  return (
    <div className="home-shell">
      <div className="home-glow" aria-hidden="true" />
      <main className="relative mx-auto w-full max-w-xl px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-2">
          <Link href="/profile" className="shrink-0 rounded-full" aria-label="Profil">
            {me ? <Avatar profile={me} size="md" /> : <span className="skeleton block h-11 w-11 rounded-full" />}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="muted h-4 text-[13px] leading-4">{greeting ? `${greeting},` : ""}</p>
            {me ? (
              <h1 className="truncate text-[22px] font-semibold leading-7 tracking-tight">
                {firstName}{identity === "nilufar" ? " ✨" : ""}
              </h1>
            ) : <span className="skeleton mt-1 block h-6 w-32 rounded-lg" />}
          </div>
          <ThemeToggle />
        </header>

        {context.state === "error" || context.state === "empty" ? (
          <section className="home-card mt-6 p-6 text-center">
            <p className="font-semibold">{context.state === "empty" ? "Suhbat hali sozlanmagan" : "Ma'lumotlarni yuklab bo'lmadi"}</p>
            <p className="muted mt-1 text-sm">Internet aloqasini tekshirib, qayta urinib ko&apos;ring.</p>
            <button type="button" onClick={() => void context.reload()} className="primary-button mt-4"><RotateCw size={16} /> Qayta urinish</button>
          </section>
        ) : (
          <>
            <section className="mt-5" aria-labelledby="stories-title">
              <h2 id="stories-title" className="section-title">Storis</h2>
              {ready ? (
                <StoryTray userId={userId} conversationId={conversationId} me={me} other={other} otherName={otherName} />
              ) : (
                <div className="story-row" aria-hidden="true">
                  {[0, 1].map((key) => <div key={key} className="story-item"><span className="skeleton h-[4.5rem] w-[4.5rem] rounded-full" /><span className="skeleton mt-2 h-2.5 w-12 rounded-full" /></div>)}
                </div>
              )}
            </section>

            <section className="mt-4" aria-labelledby="chats-title">
              <h2 id="chats-title" className="section-title">Suhbatlar</h2>
              {ready ? (
                <Link href="/chat" className="home-card conversation-card" aria-label={`${otherName} bilan suhbat${unread ? `, ${unread} ta yangi xabar` : ""}`}>
                  <span className="relative shrink-0">
                    <Avatar profile={other} size="lg" />
                    {realtime.online ? <i className="presence-dot presence-dot-lg" aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[17px] font-semibold tracking-tight">{otherName}</span>
                      <span className={`shrink-0 text-xs ${unread ? "font-semibold text-[var(--accent)]" : "muted"}`}>{listTimeLabel(last?.created_at ?? null)}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[14px] leading-5 ${realtime.typing ? "text-[var(--accent)]" : unread ? "font-medium text-[var(--text)]" : "muted"}`}>
                        {realtime.typing ? (
                          <>yozmoqda<span className="typing-dots"><i /><i /><i /></span></>
                        ) : last ? (
                          <>
                            {lastMine && !last.deleted_at && last.type !== "system" ? (
                              <span className="mr-1 inline-flex align-[-2px] text-[var(--accent)]">{summary?.lastRead ? <CheckCheck size={15} /> : <Check size={15} />}</span>
                            ) : null}
                            {lastMine && last.type !== "system" ? "Siz: " : ""}{messagePreview(last)}
                          </>
                        ) : summaryError ? "Oxirgi xabarni yuklab bo'lmadi" : summary ? "Birinchi xabarni yuboring" : <span className="skeleton inline-block h-3 w-40 rounded-full align-middle" />}
                      </span>
                      {unread ? <span className="unread-badge">{unread > 99 ? "99+" : unread}</span> : <ChevronRight size={18} className="muted shrink-0 opacity-60" />}
                    </span>
                    {statusLine && !realtime.typing ? <span className={`mt-1 block truncate text-[11.5px] ${realtime.online ? "text-emerald-500" : "muted"}`}>{statusLine}</span> : null}
                  </span>
                </Link>
              ) : (
                <div className="home-card conversation-card" aria-hidden="true">
                  <span className="skeleton h-[4.5rem] w-[4.5rem] shrink-0 rounded-full" />
                  <span className="flex-1 space-y-2"><span className="skeleton block h-4 w-32 rounded-full" /><span className="skeleton block h-3 w-48 rounded-full" /></span>
                </div>
              )}
            </section>

            <p className="muted mt-8 flex items-center justify-center gap-1.5 text-center text-xs opacity-80">
              <LockKeyhole size={12} /> Faqat ikkingiz uchun shaxsiy makon
            </p>
          </>
        )}
      </main>
      <BottomNav unread={unread} />
    </div>
  );
}
