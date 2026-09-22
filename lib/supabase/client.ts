import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE_NAME } from "./constants";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createBrowserClient(url, key, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
  });
}
