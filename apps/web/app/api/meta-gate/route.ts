import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { checkMetaGate } from "@/lib/meta-rate-limit";
import { META_BATCH_SIZE } from "@/lib/meta-graph";
import { resolveMetaToken } from "@/lib/meta-token";

export const dynamic = "force-dynamic";

/**
 * Live Meta fetch-gate state for the header pill: rolling call count, cooldown
 * countdown, and which token is active (main vs staged temporary). Polled by
 * the TopBar so the whole team can see WHY a Fetch is pacing itself instead of
 * guessing the app is broken. Any signed-in user may read it.
 */
export async function GET() {
  try {
    await requireActor();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gate = await checkMetaGate();
  const token = await resolveMetaToken();
  const main = process.env.META_GRAPH_API_TOKEN?.trim() || null;

  return NextResponse.json({
    coolingDown: gate.coolingDown,
    retryAfterSec: gate.retryAfterSec,
    count: gate.count,
    limit: META_BATCH_SIZE,
    tokenMode: token && main && token !== main ? "temporary" : "main",
  });
}
