import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import {
  parseStoredPartnershipState,
  type PartnershipState,
} from "@/lib/partnership";

/**
 * Partnership Status tab — per-CREATOR rollup of the Meta branded-content
 * permission mirrored on posts (partnership_status + lifecycle timestamps,
 * stamped by lib/partnership-sync.ts).
 *
 * The permission is account-level (one record per creator), so the board
 * collapses posts rows to ONE card per inf_id. Buckets:
 *   Requested  — pending (invite sent, awaiting the creator)
 *   Accepted   — approved
 *   Rejected   — rejected + revoked (Resend offered)
 * Rows whose stored state is none/unknown are not carded (no active request).
 */
export type PartnershipBucket = "requested" | "accepted" | "rejected";

export interface PartnershipCard {
  infId: string;
  username: string | null;
  name: string | null;
  profilePic: string | null;
  followers: number | null;
  category: string | null;
  isActive: boolean | null;
  state: PartnershipState;
  bucket: PartnershipBucket;
  sentAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  /** Distinct live posts rows carrying this creator's partnership state. */
  postCount: number;
  campaigns: string[];
}

export interface PartnershipBoardData {
  cards: PartnershipCard[];
  kpi: {
    requested: number;
    accepted: number;
    rejected: number;
    total: number;
  };
  campaignOptions: string[];
}

export interface PartnershipFilters {
  q?: string;
  campaign?: string;
  sentFrom?: string;
  sentTo?: string;
}

function bucketOf(state: PartnershipState): PartnershipBucket | null {
  if (state === "pending") return "requested";
  if (state === "approved") return "accepted";
  if (state === "rejected" || state === "revoked") return "rejected";
  return null;
}

const maxIso = (a: string | null, b: string | null): string | null =>
  !a ? b : !b ? a : a > b ? a : b;

export async function fetchPartnershipBoard(
  filters: PartnershipFilters,
): Promise<PartnershipBoardData> {
  const supabase = createServiceClient();

  // NOTE: is_test rows are intentionally INCLUDED — project convention is that
  // test entries stay visible until their Test Mode scope purges them, and the
  // @saadaa_women test rig relies on appearing here.
  const { data: postRows, error } = await (supabase as any)
    .from("posts")
    .select(
      "inf_id, username, campaign_id, partnership_status, partnership_sent_at, partnership_approved_at, partnership_declined_at",
    )
    .not("partnership_status", "is", null);
  if (error) throw new Error(error.message);

  // Collapse to one aggregate per creator (inf_id; username fallback for any
  // stray row without one).
  const byCreator = new Map<
    string,
    {
      infId: string;
      username: string | null;
      state: PartnershipState;
      sentAt: string | null;
      approvedAt: string | null;
      declinedAt: string | null;
      postCount: number;
      campaigns: Set<string>;
    }
  >();
  for (const r of (postRows ?? []) as Array<Record<string, any>>) {
    const state = parseStoredPartnershipState(r.partnership_status);
    if (!state || !bucketOf(state)) continue;
    const key = (r.inf_id as string | null) ?? `@${r.username ?? ""}`;
    if (!key || key === "@") continue;
    const agg = byCreator.get(key) ?? {
      infId: (r.inf_id as string | null) ?? key,
      username: (r.username as string | null) ?? null,
      state,
      sentAt: null,
      approvedAt: null,
      declinedAt: null,
      postCount: 0,
      campaigns: new Set<string>(),
    };
    agg.state = state; // rows are stamped uniformly per creator
    agg.username = agg.username ?? ((r.username as string | null) ?? null);
    agg.sentAt = maxIso(agg.sentAt, r.partnership_sent_at ?? null);
    agg.approvedAt = maxIso(agg.approvedAt, r.partnership_approved_at ?? null);
    agg.declinedAt = maxIso(agg.declinedAt, r.partnership_declined_at ?? null);
    agg.postCount += 1;
    if (r.campaign_id) agg.campaigns.add(String(r.campaign_id));
    byCreator.set(key, agg);
  }

  // Enrich with the creators profile (name / avatar / followers / active flag).
  const infIds = Array.from(byCreator.values())
    .map((c) => c.infId)
    .filter((v) => v && !v.startsWith("@"));
  const creatorByInfId = new Map<string, Record<string, any>>();
  if (infIds.length > 0) {
    const { data: creators } = await (supabase as any)
      .from("creators")
      .select("inf_id, inf_name, username, profile_pic, followers, category, is_active")
      .in("inf_id", infIds);
    for (const c of (creators ?? []) as Array<Record<string, any>>) {
      if (c.inf_id) creatorByInfId.set(String(c.inf_id), c);
    }
  }

  let cards: PartnershipCard[] = Array.from(byCreator.values()).map((c) => {
    const profile = creatorByInfId.get(c.infId);
    return {
      infId: c.infId,
      username: c.username ?? ((profile?.username as string | null) ?? null),
      name: (profile?.inf_name as string | null) ?? null,
      profilePic: (profile?.profile_pic as string | null) ?? null,
      followers: (profile?.followers as number | null) ?? null,
      category: (profile?.category as string | null) ?? null,
      isActive: (profile?.is_active as boolean | null) ?? null,
      state: c.state,
      bucket: bucketOf(c.state)!,
      sentAt: c.sentAt,
      approvedAt: c.approvedAt,
      declinedAt: c.declinedAt,
      postCount: c.postCount,
      campaigns: Array.from(c.campaigns).sort(),
    };
  });

  const campaignOptions = Array.from(
    new Set(cards.flatMap((c) => c.campaigns)),
  ).sort();

  // Filters (applied after the rollup — the corpus is per-creator).
  const q = (filters.q ?? "").trim().toLowerCase();
  if (q) {
    cards = cards.filter((c) =>
      [c.infId, c.username ?? "", c.name ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }
  if (filters.campaign) {
    cards = cards.filter((c) => c.campaigns.includes(filters.campaign!));
  }
  if (filters.sentFrom) {
    cards = cards.filter((c) => (c.sentAt ?? "") >= filters.sentFrom!);
  }
  if (filters.sentTo) {
    // sentTo is a date — include the whole day.
    const to = `${filters.sentTo}T23:59:59.999Z`;
    cards = cards.filter((c) => (c.sentAt ?? "") <= to);
  }

  // Newest request first inside every lane.
  cards.sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));

  const kpi = {
    requested: cards.filter((c) => c.bucket === "requested").length,
    accepted: cards.filter((c) => c.bucket === "accepted").length,
    rejected: cards.filter((c) => c.bucket === "rejected").length,
    total: cards.length,
  };

  return { cards, kpi, campaignOptions };
}
