import { redirect } from "next/navigation";
import ThemeProvider from "@/components/app/theme-provider";
import SharedMedia from "@/components/profile/shared-media";
import { getUserIdentity } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";

export default async function MediaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const identity = getUserIdentity(user.email);
  return <ThemeProvider identity={identity}><SharedMedia userId={user.id} /></ThemeProvider>;
}
