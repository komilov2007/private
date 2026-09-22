/* eslint-disable @next/next/no-img-element */
import type { Profile } from "@/lib/chat/types";

export default function Avatar({ profile, size = "md", ring = false }: { profile: Profile | null; size?: "sm" | "md" | "lg" | "xl"; ring?: boolean }) {
  const initial = profile?.display_name?.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className="avatar" data-size={size} data-ring={ring || undefined}>
      {/* Signed private URLs cannot use the static Next image optimizer. */}
      {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{initial}</span>}
    </span>
  );
}
