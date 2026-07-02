import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { publicEnv } from "./lib/env";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
          cookies.forEach(({ name, value, options }) => {
              req.cookies.set(name, value);
              res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Expiry-aware session refresh. getSession() is a local cookie read (no
  // network round-trip in @supabase/ssr). We only call getUser() — which hits
  // the Supabase Auth server and writes refreshed tokens back through the
  // cookie plumbing above — when the access token is within 5 minutes of
  // expiry. Security is unaffected: middleware's only job is token refresh;
  // server components re-validate every request via getActor() ->
  // supabase.auth.getUser() (lib/auth.ts) before trusting the user, so a
  // stale/forged cookie never grants access.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const REFRESH_WINDOW_MS = 5 * 60 * 1000;
  if (session?.expires_at && session.expires_at * 1000 - Date.now() < REFRESH_WINDOW_MS) {
    await supabase.auth.getUser();
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
