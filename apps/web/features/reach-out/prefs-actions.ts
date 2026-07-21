"use server";

import { getActor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { GENDERS } from "./schema";
import { findContentCode } from "./content-codes";

/**
 * Outbound reach-out sticky pre-selection "pins" — per-user (keyed on the
 * signed-in email, so one member's pins never leak to another), stored in
 * user_prefs under key 'reachout_pins'. Presence of a field = pin ON; the
 * stored value is what the form pre-selects after every submit.
 */

const PIN_KEY = "reachout_pins";

export type ReachoutPinField = "campaignId" | "gender" | "contentType";
const PIN_FIELDS: readonly ReachoutPinField[] = [
  "campaignId",
  "gender",
  "contentType",
];

export type ReachoutPins = Partial<Record<ReachoutPinField, string>>;

function isValidPinValue(field: ReachoutPinField, value: string): boolean {
  if (!value || value.length > 64) return false;
  if (field === "gender") return (GENDERS as readonly string[]).includes(value);
  if (field === "contentType") return Boolean(findContentCode(value));
  return true; // campaignId — existence re-checked against the live list on read
}

/** Read the current user's pins (best-effort; {} when signed out / none). */
export async function getReachoutPins(): Promise<ReachoutPins> {
  try {
    const actor = await getActor();
    const email = actor?.email?.trim().toLowerCase();
    if (!email) return {};
    const supabase = createServiceClient();
    const { data } = await (supabase as any)
      .from("user_prefs")
      .select("value")
      .eq("email", email)
      .eq("key", PIN_KEY)
      .maybeSingle();
    const raw = ((data as { value?: unknown } | null)?.value ?? {}) as Record<
      string,
      unknown
    >;
    const out: ReachoutPins = {};
    for (const f of PIN_FIELDS) {
      const v = raw[f];
      if (typeof v === "string" && v.trim() && isValidPinValue(f, v.trim())) {
        out[f] = v.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Set (value) or clear (null) one pin for the current user. Best-effort. */
export async function setReachoutPin(
  field: ReachoutPinField,
  value: string | null,
): Promise<{ ok: boolean }> {
  try {
    if (!PIN_FIELDS.includes(field)) return { ok: false };
    const actor = await getActor();
    const email = actor?.email?.trim().toLowerCase();
    if (!email) return { ok: false };
    const v = (value ?? "").trim();
    if (v && !isValidPinValue(field, v)) return { ok: false };

    const supabase = createServiceClient();
    const { data } = await (supabase as any)
      .from("user_prefs")
      .select("value")
      .eq("email", email)
      .eq("key", PIN_KEY)
      .maybeSingle();
    const cur = ((data as { value?: unknown } | null)?.value ?? {}) as Record<
      string,
      unknown
    >;
    if (v) cur[field] = v;
    else delete cur[field];

    const { error } = await (supabase as any).from("user_prefs").upsert(
      {
        email,
        key: PIN_KEY,
        value: cur,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email,key" },
    );
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
