import { redirect } from "next/navigation";
import ThemeProvider from "@/components/app/theme-provider";
import HomeScreen from "@/components/home/home-screen";
import { getUserIdentity } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const identity = getUserIdentity(user.email);
  return <ThemeProvider identity={identity}><HomeScreen userId={user.id} identity={identity} /></ThemeProvider>;
}
