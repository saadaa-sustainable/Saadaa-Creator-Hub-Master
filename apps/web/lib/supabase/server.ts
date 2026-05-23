import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types.gen";
import { publicEnv } from "../env";
import { serverEnv } from "../env.server";

/**
 * RSC- and Route-Handler-friendly Supabase client.
 * Uses cookies for session — supports user-scoped RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any) {
          try {
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
          } catch {
            // setAll throws when called from a Server Component; safe to ignore
            // because middleware refreshes the session.
          }
        },
      },
    },
  );
}

/**
 * Privileged service-role client.
 * NEVER ship to the browser. Only use inside server actions / route handlers
 * AFTER calling assertPermission().
 */
export function createServiceClient() {
  if (!serverEnv.SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_SERVICE_KEY is not set");
  }
  return createServiceRoleClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
