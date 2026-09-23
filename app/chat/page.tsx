import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatShell from "@/components/chat/chat-shell";
import AuthenticatedApp from "@/components/app/authenticated-app";
import { getUserIdentity } from "@/lib/identity";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const identity = getUserIdentity(user.email);
  return <AuthenticatedApp userId={user.id} identity={identity}><ChatShell userId={user.id} identity={identity} /></AuthenticatedApp>;
}
