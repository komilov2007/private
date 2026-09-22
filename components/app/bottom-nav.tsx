"use client";

import { House, Images, MessageCircle, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Asosiy", icon: House },
  { href: "/chat", label: "Suhbat", icon: MessageCircle },
  { href: "/media", label: "Media", icon: Images },
  { href: "/profile", label: "Profil", icon: UserRound },
] as const;

export default function BottomNav({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Asosiy menyu">
      <div className="bottom-nav-inner">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className="bottom-nav-item" data-active={active || undefined} aria-current={active ? "page" : undefined}>
              <span className="relative">
                <Icon size={22} strokeWidth={active ? 2.3 : 1.9} />
                {href === "/chat" && unread > 0 ? <span className="nav-badge">{unread > 99 ? "99+" : unread}</span> : null}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
