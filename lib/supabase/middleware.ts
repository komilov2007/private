import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "./constants";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  function redirectWithRefreshedCookies(pathname: string) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = pathname;
    const redirectResponse = NextResponse.redirect(nextUrl);

    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));

    return redirectResponse;
  }

  const pathname = request.nextUrl.pathname;
  const protectedPath = pathname === "/" || ["/chat", "/profile", "/media"].some((path) => pathname.startsWith(path));
  if (!user && protectedPath) {
    return redirectWithRefreshedCookies("/login");
  }
  if (user && pathname === "/login") {
    return redirectWithRefreshedCookies("/");
  }

  return response;
}
