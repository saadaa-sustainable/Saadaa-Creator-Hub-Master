import { createServiceClient } from "@/lib/supabase/server";
import {
  daysOverdue,
  isOffboardingCandidateRow,
  offboardingCutoffIso,
  OFFBOARDING_PENDING_STATUSES,
  todayIsoInIndia,
} from "./rules";
import type {
  OffboardingCreator,
  OffboardingFilterOptions,
  OffboardingFilters,
  OffboardingKpi,
} from "./types";

type Raw = Record<string, unknown>;

const CREATOR_SELECT = [
  "inf_id",
  "username",
  "inf_name",
  "instagram_link",
  "profile_pic",
  "category",
  "followers",
  "is_blacklisted",
  "blacklist_reason",
  "blacklisted_at",
  "blacklisted_by",
  "blacklist_evidence",
].join(",");

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function matchesSearch(row: OffboardingCreator, search: string): boolean {
  if (!search) return true;
  const haystack = [
    row.infId,
    row.name,
    row.username,
    row.blacklistReason ?? "",
    ...row.campaigns,
    ...row.postIds,
    ...row.teamMembers,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(search);
}

function sortedDates(rows: Raw[], key: string): string[] {
  return rows
    .map((row) => String(row[key] ?? "").slice(0, 10))
    .filter(Boolean)
    .sort();
}

function uniqueValues(rows: Raw[], value: (row: Raw) => unknown): string[] {
  return Array.from(
    new Set(rows.map((row) => String(value(row) ?? "").trim()).filter(Boolean)),
  );
}

function groupCandidateRows(rows: Raw[], today: string): Map<string, Raw[]> {
  const grouped = new Map<string, Raw[]>();
  for (const row of rows) {
    if (!isOffboardingCandidateRow(row, today)) continue;
    const infId = String(row.inf_id ?? "").trim();
    if (!infId) continue;
    grouped.set(infId, [...(grouped.get(infId) ?? []), row]);
  }
  return grouped;
}

function candidateFromRows(
  infId: string,
  rows: Raw[],
  creator: Raw,
  today: string,
): OffboardingCreator | null {
  if (creator.is_blacklisted === true) return null;

  const deadlines = sortedDates(rows, "est_delivery");
  const onboardDates = sortedDates(rows, "onboard_date");
  const campaigns = uniqueValues(rows, (row) => row.campaign_id);
  const postIds = rows
    .map((row) => String(row.post_id ?? "").trim())
    .filter(Boolean);
  const collabIds = uniqueValues(rows, (row) => row.collab_id ?? row.post_id);
  const teamMembers = uniqueValues(
    rows,
    (row) => row.onboarded_by ?? row.logged_by,
  );
  const username = String(creator.username ?? rows[0]?.username ?? "").trim();
  const oldestDeadline = deadlines[0] ?? null;

  return {
    state: "candidate",
    infId,
    name: String(creator.inf_name ?? username),
    username,
    instagramLink:
      String(creator.instagram_link ?? "").trim() ||
      (username ? `https://www.instagram.com/${username}/` : null),
    profilePicUrl: String(creator.profile_pic ?? "").trim() || null,
    category: String(creator.category ?? "").trim() || null,
    followers: Number(creator.followers ?? 0) || null,
    overdueDeliverables: rows.length,
    overdueCollabs: collabIds.length,
    oldestDeadline,
    daysOverdue: daysOverdue(oldestDeadline, today),
    campaigns,
    postIds,
    teamMembers,
    lastOnboardDate: onboardDates.at(-1) ?? null,
    blacklistReason: null,
    blacklistedAt: null,
    blacklistedBy: null,
  };
}

function offboardedFromCreator(
  creator: Raw,
  today: string,
): OffboardingCreator {
  const evidence =
    creator.blacklist_evidence && typeof creator.blacklist_evidence === "object"
      ? (creator.blacklist_evidence as Raw)
      : {};
  const oldestDeadline =
    String(evidence.oldestDeadline ?? "").slice(0, 10) || null;
  const username = String(creator.username ?? "").trim();

  return {
    state: "offboarded",
    infId: String(creator.inf_id ?? ""),
    name: String(creator.inf_name ?? username),
    username,
    instagramLink:
      String(creator.instagram_link ?? "").trim() ||
      (username ? `https://www.instagram.com/${username}/` : null),
    profilePicUrl: String(creator.profile_pic ?? "").trim() || null,
    category: String(creator.category ?? "").trim() || null,
    followers: Number(creator.followers ?? 0) || null,
    overdueDeliverables: Number(evidence.overdueDeliverables ?? 0) || 0,
    overdueCollabs: Number(evidence.overdueCollabs ?? 0) || 0,
    oldestDeadline,
    daysOverdue: daysOverdue(oldestDeadline, today),
    campaigns: stringList(evidence.campaigns),
    postIds: stringList(evidence.postIds),
    teamMembers: stringList(evidence.teamMembers),
    lastOnboardDate: null,
    blacklistReason: String(creator.blacklist_reason ?? "").trim() || null,
    blacklistedAt: String(creator.blacklisted_at ?? "").trim() || null,
    blacklistedBy: String(creator.blacklisted_by ?? "").trim() || null,
  };
}

/**
 * Creator-level offboarding data.
 *
 * Candidate rule: estimated delivery is before today and the deliverable is
 * still in the unsubmitted Posting queue (`On Board` / `Order Sent`). Posting
 * submission moves it to `Posted`, so the workflow status is the authoritative
 * "form filled" signal. Rows are grouped by creator before reaching the UI.
 */
export async function fetchOffboardingData(
  filters: OffboardingFilters,
): Promise<{
  candidates: OffboardingCreator[];
  offboarded: OffboardingCreator[];
  kpi: OffboardingKpi;
}> {
  const supabase = createServiceClient();
  const today = todayIsoInIndia();
  // Only surface a creator once est_delivery + OFFBOARDING_GRACE_DAYS is crossed.
  const cutoff = offboardingCutoffIso(today);

  const [
    { data: overdueRows, error: overdueError },
    { data: blacklistedRows, error: blacklistError },
  ] = await Promise.all([
    (supabase as any)
      .from("posts")
      .select(
        "post_id, collab_id, inf_id, username, campaign_id, workflow_status, est_delivery, onboard_date, onboarded_by, logged_by",
      )
      .in("workflow_status", [...OFFBOARDING_PENDING_STATUSES])
      .lt("est_delivery", cutoff)
      .not("inf_id", "is", null)
      .order("est_delivery", { ascending: true })
      .limit(50000),
    (supabase as any)
      .from("creators")
      .select(CREATOR_SELECT)
      .eq("is_blacklisted", true)
      .order("blacklisted_at", { ascending: false })
      .limit(10000),
  ]);

  if (overdueError) {
    console.error("[offboarding] overdue query failed:", overdueError);
    throw overdueError;
  }
  if (blacklistError) {
    console.error("[offboarding] blacklist query failed:", blacklistError);
    throw blacklistError;
  }

  const grouped = groupCandidateRows((overdueRows ?? []) as Raw[], today);

  const candidateIds = [...grouped.keys()];
  const { data: candidateCreators, error: candidateCreatorError } =
    candidateIds.length > 0
      ? await (supabase as any)
          .from("creators")
          .select(CREATOR_SELECT)
          .in("inf_id", candidateIds)
          .limit(50000)
      : { data: [], error: null };
  if (candidateCreatorError) throw candidateCreatorError;

  const creatorById = new Map<string, Raw>();
  for (const creator of (candidateCreators ?? []) as Raw[]) {
    creatorById.set(String(creator.inf_id ?? ""), creator);
  }

  let candidates = [...grouped.entries()]
    .map(([infId, rows]) =>
      candidateFromRows(infId, rows, creatorById.get(infId) ?? {}, today),
    )
    .filter((row): row is OffboardingCreator => row !== null);

  let offboarded = ((blacklistedRows ?? []) as Raw[]).map((creator) =>
    offboardedFromCreator(creator, today),
  );

  const campaign = String(filters.campaign ?? "").trim();
  if (campaign) {
    candidates = candidates.filter((row) => row.campaigns.includes(campaign));
    offboarded = offboarded.filter((row) => row.campaigns.includes(campaign));
  }

  candidates.sort(
    (a, b) =>
      b.daysOverdue - a.daysOverdue || a.username.localeCompare(b.username),
  );
  offboarded.sort((a, b) =>
    String(b.blacklistedAt ?? "").localeCompare(String(a.blacklistedAt ?? "")),
  );

  const kpi: OffboardingKpi = {
    candidates: candidates.length,
    overdueDeliverables: candidates.reduce(
      (sum, row) => sum + row.overdueDeliverables,
      0,
    ),
    offboardedCreators: offboarded.length,
    longestOverdueDays: candidates.reduce(
      (max, row) => Math.max(max, row.daysOverdue),
      0,
    ),
  };

  const search = String(filters.search ?? "")
    .trim()
    .toLowerCase();
  if (search) {
    candidates = candidates.filter((row) => matchesSearch(row, search));
    offboarded = offboarded.filter((row) => matchesSearch(row, search));
  }

  return { candidates, offboarded, kpi };
}

export async function fetchOffboardingFilterOptions(): Promise<OffboardingFilterOptions> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("campaigns")
    .select("campaign_id, campaign_name")
    .order("campaign_id", { ascending: false })
    .limit(500);
  return {
    campaigns: (
      (data ?? []) as Array<{
        campaign_id: string;
        campaign_name: string | null;
      }>
    ).map((campaign) => ({
      id: campaign.campaign_id,
      name: campaign.campaign_name ?? campaign.campaign_id,
    })),
  };
}
