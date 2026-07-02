import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { syncCreatorPartnership } from "@/lib/partnership-sync";
import { parseStoredPartnershipState } from "@/lib/partnership";

/**
 * Daily partnership-status refresh — the background half of "real-time".
 *
 * The on-view sweep (Partnership Status tab) only covers pending creators
 * while someone is looking. This cron re-reads the Meta branded-content
 * permission for every creator on the board so approvals / declines /
 * revocations land in the DB even when nobody opens the tab:
 *
 *   1. ALL pending creators, oldest request first (they're the ones whose
 *      state actually changes), then
 *   2. the least-recently-updated approved/rejected creators with whatever
 *      budget remains (catches revocations + creator re-approvals).
 *
 * Budget: PARTNERSHIP_CRON_MAX creators per run (default 40) with a hard
 * time guard, sized for the 60s function ceiling at ~0.5-1s per Meta GET.
 * A 100-creator board fully cycles in ~2-3 days; pending creators are
 * re-checked EVERY run. Never sends an invite (autoInvite: false).
 *
 * AUTH: same guard as /api/cron/notifications — `x-vercel-cron` header or
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_MS = 45_000;
const PER_CALL_DELAY_MS = 120;

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  return false;
}

interface CreatorAgg {
  infId: string;
  username: string | null;
  state: string;
  sentAt: string;
  updatedAt: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const maxChecks = Math.max(
    1,
    Number(process.env.PARTNERSHIP_CRON_MAX ?? 40) || 40,
  );

  const supabase = createServiceClient();
  const { data, error } = await (supabase as any)
    .from("posts")
    .select("inf_id, username, partnership_status, partnership_sent_at, updated_at")
    .not("partnership_status", "is", null)
    .not("inf_id", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Collapse rows to one entry per creator (state is stamped uniformly).
  const byCreator = new Map<string, CreatorAgg>();
  for (const r of (data ?? []) as Array<Record<string, any>>) {
    const state = parseStoredPartnershipState(r.partnership_status);
    if (!state || state === "none" || state === "unknown") continue;
    const infId = String(r.inf_id);
    const prev = byCreator.get(infId);
    const sentAt = String(r.partnership_sent_at ?? "");
    const updatedAt = String(r.updated_at ?? "");
    if (!prev) {
      byCreator.set(infId, {
        infId,
        username: (r.username as string | null) ?? null,
        state,
        sentAt,
        updatedAt,
      });
    } else {
      if (sentAt > prev.sentAt) prev.sentAt = sentAt;
      if (updatedAt > prev.updatedAt) prev.updatedAt = updatedAt;
      prev.username = prev.username ?? ((r.username as string | null) ?? null);
    }
  }

  const all = Array.from(byCreator.values());
  const pending = all
    .filter((c) => c.state === "pending")
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt)); // oldest request first
  const settled = all
    .filter((c) => c.state !== "pending")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)); // stalest first
  const queue = [...pending, ...settled].slice(0, maxChecks);

  let checked = 0;
  let changed = 0;
  let failed = 0;
  for (const c of queue) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const res = await syncCreatorPartnership({
      infId: c.infId,
      username: c.username,
      autoInvite: false,
      source: "cron-partnership-refresh",
    });
    checked += 1;
    if (!res.ok) failed += 1;
    else if (res.state && res.state !== c.state) changed += 1;
    await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS));
  }

  if (changed > 0) {
    revalidateTag("posts");
    revalidatePath("/posting");
    revalidatePath("/accounts-hub");
    revalidatePath("/dashboard");
  }

  const summary = {
    ok: true,
    creatorsOnBoard: all.length,
    pendingOnBoard: pending.length,
    checked,
    changed,
    failed,
    skipped: queue.length - checked,
    tookMs: Date.now() - startedAt,
  };
  console.log("[cron/partnership-refresh]", JSON.stringify(summary));
  return NextResponse.json(summary);
}
