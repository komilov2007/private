import { redirect } from "next/navigation";
import AuthenticatedApp from "@/components/app/authenticated-app";
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
  return <AuthenticatedApp userId={user.id} identity={identity}><HomeScreen userId={user.id} identity={identity} /></AuthenticatedApp>;
}
