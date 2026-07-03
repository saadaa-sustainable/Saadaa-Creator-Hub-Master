import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncWarehouseCacheToDb } from "@/lib/supabase/meta-ads";

/**
 * Daily Meta Ads warehouse → meta_ads_cache sync.
 *
 * WHY: cross-project scans of the warehouse time out on every Vercel request
 * (verified in prod runtime logs), so the Ad Status board and the payment
 * "posted but not tested" stamping read a local mirror instead. This cron
 * refreshes that mirror once a day, after the warehouse's own nightly
 * refresh. Manual refresh from a dev machine:
 * `node scripts/sync-warehouse-cache.mjs`.
 *
 * AUTH: same guard as the other crons — `x-vercel-cron` or CRON_SECRET.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const result = await syncWarehouseCacheToDb();
  if (result.ok) {
    revalidatePath("/performance/ad-run-status");
    revalidatePath("/dashboard");
  }
  const summary = { ...result, tookMs: Date.now() - startedAt };
  console.log("[cron/warehouse-sync]", JSON.stringify(summary));
  return NextResponse.json(summary, { status: result.ok ? 200 : 500 });
}
