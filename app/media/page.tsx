import { redirect } from "next/navigation";
import AuthenticatedApp from "@/components/app/authenticated-app";
import SharedMedia from "@/components/profile/shared-media";
import { getUserIdentity } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";

export default async function MediaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const identity = getUserIdentity(user.email);
  return <AuthenticatedApp userId={user.id} identity={identity}><SharedMedia userId={user.id} /></AuthenticatedApp>;
}
