import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatShell from "@/components/chat/chat-shell";
import ThemeProvider from "@/components/app/theme-provider";
import { getUserIdentity } from "@/lib/identity";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const identity = getUserIdentity(user.email);
  return <ThemeProvider identity={identity}><ChatShell userId={user.id} identity={identity} /></ThemeProvider>;
}
