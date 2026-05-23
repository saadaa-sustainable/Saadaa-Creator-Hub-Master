import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * OAuth callback — Supabase redirects here with `?code=…` after the user
 * approves Google sign-in. Exchange the code for a session cookie, then
 * route the user to `next` (default `/dashboard`).
 *
 * Required Supabase dashboard configuration:
 *   Auth → URL Configuration:
 *     Site URL                = http://localhost:3000   (or your prod domain)
 *     Additional Redirect URLs:
 *       - http://localhost:3000/auth/callback
 *       - https://<prod-domain>/auth/callback
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const errorParam =
    searchParams.get("error_description") ?? searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: any) => {
          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }: {
              name: string;
              value: string;
              options: CookieOptions;
            }) => {
              cookieStore.set(name, value, options);
            },
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Sanity check: only allow team members through. If the email isn't on
  // user_access OR is marked inactive, sign them out and bounce to /login.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    const { data: row } = await supabase
      .from("user_access")
      .select("active")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    if (!row || !row.active) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?reason=revoked`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
