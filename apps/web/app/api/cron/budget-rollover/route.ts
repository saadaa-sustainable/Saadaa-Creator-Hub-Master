import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  computeExpectedByCampaignMonth,
  monthKeyIST,
  rollBudgetMonth,
} from "@/lib/budget-versions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Month rollover — runs on the 1st (vercel.json). Closes the month that just
 * ended and creates a pre-approved carry-forward version for every live
 * campaign's unused balance (allocated − expected). Idempotent, so a manual
 * re-run (or a missed cron caught up later) is safe.
 *
 * AUTH: same guard as the other crons — `x-vercel-cron` header or
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
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

  const supabase = createServiceClient();
  const nowMonth = monthKeyIST(new Date());
  const prev = new Date(nowMonth + "T00:00:00Z");
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const fromMonth = prev.toISOString().slice(0, 8) + "01";

  try {
    const expected = await computeExpectedByCampaignMonth(supabase);
    const result = await rollBudgetMonth(supabase, fromMonth, expected);
    console.log(
      `[budget-rollover] ${result.month}: closed=${result.closed} carried=${result.carried} (₹${result.carriedAmount.toLocaleString("en-IN")})`,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "rollover failed";
    console.error("[budget-rollover]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
