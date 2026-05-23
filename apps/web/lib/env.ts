import { z } from "zod";

/**
 * Public env — safe for the browser bundle.
 *
 * Server-only env (Supabase service key, GAS_EMAIL_*, etc.) lives in
 * `./env.server.ts` to keep this file free of any side effect that could
 * crash a client bundle that imports `publicEnv`.
 */

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export const publicEnv = PublicEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
