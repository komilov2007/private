import { redirect } from "next/navigation";
import ThemeProvider from "@/components/app/theme-provider";
import ProfileScreen from "@/components/profile/profile-screen";
import { getUserIdentity } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const identity = getUserIdentity(user.email);
  return <ThemeProvider identity={identity}><ProfileScreen userId={user.id} email={user.email ?? ""} /></ThemeProvider>;
}
