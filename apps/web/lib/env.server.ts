import "server-only";
import { z } from "zod";
import { publicEnv } from "./env";

/**
 * Server-only env. Importing this file from a client component is a build
 * error (via `server-only`). Keep all secrets here.
 */

const ServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
  SHOPIFY_WEBHOOK_SECRET: z.string().min(1).optional(),

  /**
   * Email delivery via Nodemailer + Gmail SMTP.
   * EMAIL_USER = sending address (e.g. emailmarketing@saadaa.in)
   * EMAIL_PASS = Gmail app password (Google Account → Security → App passwords)
   * EMAIL_FROM_NAME = display name (optional, defaults to "Saadaa")
   */
  EMAIL_USER: z.string().email().optional(),
  EMAIL_PASS: z.string().min(1).optional(),
  EMAIL_FROM_NAME: z.string().min(1).optional(),

  /**
   * Instagram scraping — Apify only, 3-hour cron pattern.
   * Fresh handles in `lookupCreator` get UPSERTed into `instagram_cache`
   * with status='pending'. The `scrape-pending-apify` Supabase Edge Function
   * runs every 3 hours, calls Apify, and writes the result back. Apify
   * failures land in `system_errors` (type='apify_fail') for Error Portal.
   *
   *  APIFY_TOKEN    = Apify API token (reuse from legacy GAS Script Properties)
   *  APIFY_ACTOR_ID = Apify actor (e.g. apify/instagram-profile-scraper)
   */
  APIFY_TOKEN: z.string().min(1).optional(),
  APIFY_ACTOR_ID: z.string().min(1).optional(),

  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
  SPREADSHEET_ID: z.string().min(1).optional(),

  /**
   * Sheet mirror — signed POST to legacy GAS doPost endpoint.
   * GAS_MIRROR_ENDPOINT = full https URL of deployed GAS web app (NOT the email endpoint)
   * GAS_MIRROR_SECRET   = HMAC-SHA256 shared secret. Must match Script Property
   *                       `MIRROR_HMAC_SECRET` in the GAS project.
   * After every Supabase reach-out / onboarding / posting / payment write,
   * the new project pushes a signed payload here to keep Creator Data sheet in sync.
   */
  GAS_MIRROR_ENDPOINT: z.string().url().optional(),
  GAS_MIRROR_SECRET: z.string().min(1).optional(),
});

/**
 * Strip empty-string env vars so they fall through to `optional()` paths.
 * `.env.local` keys without values are often `KEY=` which becomes `''` —
 * Zod's `.string().min(1).optional()` treats that as a 1-char failure, not
 * an absent value. Drop them explicitly.
 */
function stripEmpty(
  input: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

export const serverEnv = ServerEnvSchema.parse({
  ...stripEmpty(process.env),
  NEXT_PUBLIC_SUPABASE_URL: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
