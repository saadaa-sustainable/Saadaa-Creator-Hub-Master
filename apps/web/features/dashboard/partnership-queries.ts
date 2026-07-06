import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import {
  parseStoredPartnershipState,
  type PartnershipState,
} from "@/lib/partnership";
import { fetchCreatorAdsRollup } from "@/features/creator-analytics/queries";
import type { CreatorAdsSummary } from "@/features/creator-analytics/types";

/**
 * Partnership Status tab — per-CREATOR rollup of the Meta branded-content
 * permission mirrored on posts (partnership_status + lifecycle timestamps,
 * stamped by lib/partnership-sync.ts, mirrored onto creators).
 *
 * The permission is account-level (one record per creator), so the board
 * collapses posts rows to ONE card per inf_id. Five lanes (2026-07-06):
 *   requested        — pending (invite sent, awaiting the creator)
 *   rejected         — rejected + revoked (Resend offered)
 *   accepted         — approved, no warehouse-matched ads yet ("not tested")
 *   accepted-tested  — approved AND the creator has ads in the Meta Ads
 *                      warehouse mirror (creative went to testing)
 *   send-failed      — the auto-invite / resend errored (system_errors
 *                      type='partnership_sync', unresolved) and the creator
 *                      has no active request — needs a manual retry
 */
export type PartnershipBucket =
  | "requested"
  | "rejected"
  | "accepted"
  | "accepted-tested"
  | "send-failed";

export interface PartnershipCard {
  infId: string;
  username: string | null;
  name: string | null;
  profilePic: string | null;
  followers: number | null;
  category: string | null;
  isActive: boolean | null;
  state: PartnershipState | null;
  bucket: PartnershipBucket;
  sentAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  /** Distinct live posts rows carrying this creator's partnership state. */
  postCount: number;
  campaigns: string[];
  /** Meta Ads rollup — set on tested cards (null = never ran as an ad). */
  adsSummary: CreatorAdsSummary | null;
  /** Last send-failure message (send-failed lane only). */
  errorMessage: string | null;
  /** When the send failure was logged (send-failed lane only). */
  errorAt: string | null;
}

export interface PartnershipBoardData {
  cards: PartnershipCard[];
  kpi: {
    requested: number;
    rejected: number;
    accepted: number;
    acceptedTested: number;
    sendFailed: number;
    total: number;
  };
  campaignOptions: string[];
}

export interface PartnershipFilters {
  q?: string;
  campaign?: string;
  /** Ads Partnership Status — pending | approved | rejected | revoked. */
  status?: string;
  /** Creative Test Status — warehouse category (tested creators). */
  testStatus?: string;
  sentFrom?: string;
  sentTo?: string;
  /** Date of Posted range — matches ANY of the creator's stamped posts. */
  postedFrom?: string;
  postedTo?: string;
  /** Onboarding range — matches ANY of the creator's stamped posts. */
  onboardFrom?: string;
  onboardTo?: string;
  /** Warehouse ad id (tested creators). */
  adId?: string;
  /** Warehouse ad name substring (tested creators). */
  adName?: string;
}

const maxIso = (a: string | null, b: string | null): string | null =>
  !a ? b : !b ? a : a > b ? a : b;

/** Whole-day upper bound for a date-only filter value. */
const dayEnd = (d: string) => `${d}T23:59:59.999Z`;

function stateBucket(state: PartnershipState): PartnershipBucket | null {
  if (state === "pending") return "requested";
  if (state === "rejected" || state === "revoked") return "rejected";
  if (state === "approved") return "accepted"; // tested split applied later
  return null;
}

export async function fetchPartnershipBoard(
  filters: PartnershipFilters,
): Promise<PartnershipBoardData> {
  const supabase = createServiceClient();

  // NOTE: is_test rows are intentionally INCLUDED — project convention is that
  // test entries stay visible until their Test Mode scope purges them, and the
  // @saadaa_women test rig relies on appearing here.
  const [postsRes, errorsRes, rollup] = await Promise.all([
    (supabase as any)
      .from("posts")
      .select(
        "inf_id, username, campaign_id, post_date, onboard_date, partnership_status, partnership_sent_at, partnership_approved_at, partnership_declined_at",
      )
      .not("partnership_status", "is", null),
    // Unresolved invite/resend failures → the send-failed lane.
    (supabase as any)
      .from("system_errors")
      .select("key, message, created_at")
      .eq("type", "partnership_sync")
      .eq("resolved", false)
      // Quoted patterns — PostgREST's or= tree needs quoting around values
      // containing spaces.
      .or('message.ilike."%invite failed%",message.ilike."%Resend failed%"')
      .order("created_at", { ascending: false })
      .limit(500),
    fetchCreatorAdsRollup(),
  ]);
  if (postsRes.error) throw new Error(postsRes.error.message);

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
      postDates: string[];
      onboardDates: string[];
    }
  >();
  for (const r of (postsRes.data ?? []) as Array<Record<string, any>>) {
    const state = parseStoredPartnershipState(r.partnership_status);
    if (!state || !stateBucket(state)) continue;
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
      postDates: [],
      onboardDates: [],
    };
    agg.state = state; // rows are stamped uniformly per creator
    agg.username = agg.username ?? ((r.username as string | null) ?? null);
    agg.sentAt = maxIso(agg.sentAt, r.partnership_sent_at ?? null);
    agg.approvedAt = maxIso(agg.approvedAt, r.partnership_approved_at ?? null);
    agg.declinedAt = maxIso(agg.declinedAt, r.partnership_declined_at ?? null);
    agg.postCount += 1;
    if (r.campaign_id) agg.campaigns.add(String(r.campaign_id));
    if (r.post_date) agg.postDates.push(String(r.post_date));
    if (r.onboard_date) agg.onboardDates.push(String(r.onboard_date));
    byCreator.set(key, agg);
  }

  // Send-failure lane — newest unresolved failure per handle, skipping any
  // creator that meanwhile has an active request (a later send succeeded).
  const failByHandle = new Map<string, { message: string; at: string }>();
  for (const e of (errorsRes.data ?? []) as Array<Record<string, any>>) {
    const handle = String(e.key ?? "").trim().toLowerCase();
    if (!handle || failByHandle.has(handle)) continue;
    failByHandle.set(handle, {
      message: String(e.message ?? ""),
      at: String(e.created_at ?? ""),
    });
  }
  const activeHandles = new Set(
    [...byCreator.values()]
      .map((c) => (c.username ?? "").toLowerCase())
      .filter(Boolean),
  );
  const failedHandles = [...failByHandle.keys()].filter(
    (h) => !activeHandles.has(h),
  );

  // Enrich with the creators profile (name / avatar / followers / active flag)
  // — for carded creators by inf_id, for send-failures by username.
  const infIds = Array.from(byCreator.values())
    .map((c) => c.infId)
    .filter((v) => v && !v.startsWith("@"));
  const creatorByInfId = new Map<string, Record<string, any>>();
  const creatorByHandle = new Map<string, Record<string, any>>();
  const CREATOR_COLS =
    "inf_id, inf_name, username, profile_pic, followers, category, is_active";
  if (infIds.length > 0) {
    const { data: creators } = await (supabase as any)
      .from("creators")
      .select(CREATOR_COLS)
      .in("inf_id", infIds);
    for (const c of (creators ?? []) as Array<Record<string, any>>) {
      if (c.inf_id) creatorByInfId.set(String(c.inf_id), c);
    }
  }
  if (failedHandles.length > 0) {
    const { data: creators } = await (supabase as any)
      .from("creators")
      .select(CREATOR_COLS)
      .in("username", failedHandles);
    for (const c of (creators ?? []) as Array<Record<string, any>>) {
      if (c.username) creatorByHandle.set(String(c.username).toLowerCase(), c);
    }
  }

  let cards: PartnershipCard[] = Array.from(byCreator.values()).map((c) => {
    const profile = creatorByInfId.get(c.infId);
    const ads = rollup.get(c.infId) ?? null;
    const base = stateBucket(c.state)!;
    const bucket: PartnershipBucket =
      base === "accepted" && ads ? "accepted-tested" : base;
    return {
      infId: c.infId,
      username: c.username ?? ((profile?.username as string | null) ?? null),
      name: (profile?.inf_name as string | null) ?? null,
      profilePic: (profile?.profile_pic as string | null) ?? null,
      followers: (profile?.followers as number | null) ?? null,
      category: (profile?.category as string | null) ?? null,
      isActive: (profile?.is_active as boolean | null) ?? null,
      state: c.state,
      bucket,
      sentAt: c.sentAt,
      approvedAt: c.approvedAt,
      declinedAt: c.declinedAt,
      postCount: c.postCount,
      campaigns: Array.from(c.campaigns).sort(),
      adsSummary: ads,
      errorMessage: null,
      errorAt: null,
    };
  });

  // Per-creator date pools for the range filters.
  const postDatesBy = new Map<string, string[]>();
  const onboardBy = new Map<string, string[]>();
  for (const c of byCreator.values()) {
    postDatesBy.set(c.infId, c.postDates);
    onboardBy.set(c.infId, c.onboardDates);
  }

  // Send-failed cards (creator resolved by handle; unmatched handles still
  // show — the failure is real even when the roster row is missing).
  for (const h of failedHandles) {
    const fail = failByHandle.get(h)!;
    const profile = creatorByHandle.get(h);
    const infId = (profile?.inf_id as string | null) ?? `@${h}`;
    cards.push({
      infId,
      username: (profile?.username as string | null) ?? h,
      name: (profile?.inf_name as string | null) ?? null,
      profilePic: (profile?.profile_pic as string | null) ?? null,
      followers: (profile?.followers as number | null) ?? null,
      category: (profile?.category as string | null) ?? null,
      isActive: (profile?.is_active as boolean | null) ?? null,
      state: null,
      bucket: "send-failed",
      sentAt: null,
      approvedAt: null,
      declinedAt: null,
      postCount: 0,
      campaigns: [],
      adsSummary: infId.startsWith("@") ? null : (rollup.get(infId) ?? null),
      errorMessage: fail.message,
      errorAt: fail.at,
    });
  }

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
  if (filters.status) {
    cards = cards.filter((c) => c.state === filters.status);
  }
  if (filters.testStatus) {
    cards = cards.filter((c) =>
      (c.adsSummary?.categories ?? []).includes(filters.testStatus!),
    );
  }
  if (filters.sentFrom) {
    cards = cards.filter((c) => (c.sentAt ?? "") >= filters.sentFrom!);
  }
  if (filters.sentTo) {
    cards = cards.filter((c) => (c.sentAt ?? "") <= dayEnd(filters.sentTo!));
  }
  if (filters.postedFrom || filters.postedTo) {
    const from = filters.postedFrom ?? "";
    const to = filters.postedTo ? dayEnd(filters.postedTo) : "￿";
    cards = cards.filter((c) =>
      (postDatesBy.get(c.infId) ?? []).some((d) => d >= from && d <= to),
    );
  }
  if (filters.onboardFrom || filters.onboardTo) {
    const from = filters.onboardFrom ?? "";
    const to = filters.onboardTo ? dayEnd(filters.onboardTo) : "￿";
    cards = cards.filter((c) =>
      (onboardBy.get(c.infId) ?? []).some((d) => d >= from && d <= to),
    );
  }
  if (filters.adId) {
    const needle = filters.adId.trim();
    cards = cards.filter((c) =>
      (c.adsSummary?.adIds ?? []).some((id) => id.includes(needle)),
    );
  }
  if (filters.adName) {
    const needle = filters.adName.trim().toLowerCase();
    cards = cards.filter((c) =>
      (c.adsSummary?.adNames ?? []).some((n) =>
        n.toLowerCase().includes(needle),
      ),
    );
  }

  // Newest activity first inside every lane (send failures sort by errorAt).
  cards.sort((a, b) =>
    (b.errorAt ?? b.sentAt ?? "").localeCompare(a.errorAt ?? a.sentAt ?? ""),
  );

  const count = (b: PartnershipBucket) =>
    cards.filter((c) => c.bucket === b).length;
  const kpi = {
    requested: count("requested"),
    rejected: count("rejected"),
    accepted: count("accepted"),
    acceptedTested: count("accepted-tested"),
    sendFailed: count("send-failed"),
    total: cards.length,
  };

  return { cards, kpi, campaignOptions };
}
