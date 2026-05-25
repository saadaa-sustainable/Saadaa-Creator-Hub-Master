import { createServiceClient } from "@/lib/supabase/server";
import type {
  ActionCounts,
  BreakdownSlice,
  DashboardData,
  DashboardFilters,
  DashboardFilterOptions,
  MonthlyPoint,
  PulseStat,
  RankedRow,
  SparkPoint,
  StageCard,
} from "./types";

// 6 brand-aligned slice colours for the donut. New project palette only.
const SLICE_COLORS = ["#F0C61E", "#3B6FD4", "#4F7C4D", "#B57514", "#7B4FBF", "#C0392B"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (!m) return iso;
  return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1].slice(2)}`;
}

/**
 * Single parallel fetch — mirrors legacy `getDashboardStatsFiltered`
 * (InfluencerBackend.js:1600-1828) with bucket math + the new spotlight
 * sparkline + action chip counts.
 *
 * Server-side filters: campaign, content_type, workflow_status.
 * Client-side (in-memory) filters: influencerType (creator category match),
 * dateFrom/dateTo (matches if reach_out_date OR post_date sits in range).
 */
// Base columns — proven to exist across every consumer in this repo.
const POSTS_COLS_BASE = [
  "post_id",
  "post_id_short",
  "workflow_status",
  "payment_status",
  "campaign_id",
  "post_date",
  "content_type",
  "commercial_amount",
  "reels",
  "static_posts",
  "stories",
  "inf_id",
  "username",
  "reach_out_date",
  "onboard_date",
  "onboarded_by",
  "order_id",
  "tracking_id",
  "partnership_id",
  "ad_partnership_valid",
  "ads_usage_rights",
  "est_delivery",
  "email",
  "collab_email_sent_at",
  "collab_email_skipped",
  "deliverable_index",
  "collab_number",
].join(",");

// Extended set — adds the ads_status column once the Ad Status stage seeds
// it. If the column doesn't exist on prod yet, PostgREST 42703s and we
// transparently fall back to POSTS_COLS_BASE (adWinners stays at 0).
const POSTS_COLS_EXTENDED = [POSTS_COLS_BASE, "ads_status"].join(",");

const todayIso = (): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};
const yesterdayIso = (): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};
const isoDaysAgo = (n: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};
const adsRequired = (raw: string | null | undefined) => {
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return !["", "no", "n/a", "none", "0", "false"].includes(v);
};

export async function fetchDashboardFilterOptions(): Promise<DashboardFilterOptions> {
  const supabase = createServiceClient();
  const [{ data: camps }, { data: posts }] = await Promise.all([
    (supabase as any)
      .from("campaigns")
      .select("campaign_id, campaign_name")
      .order("campaign_id", { ascending: false })
      .limit(500),
    (supabase as any)
      .from("posts")
      .select("content_type, workflow_status")
      .limit(5000),
  ]);
  const contentSet = new Set<string>();
  const statusSet = new Set<string>();
  for (const p of (posts ?? []) as Array<{ content_type?: string; workflow_status?: string }>) {
    if (p.content_type) contentSet.add(p.content_type);
    if (p.workflow_status) statusSet.add(p.workflow_status);
  }
  return {
    campaigns: ((camps ?? []) as Array<{ campaign_id: string; campaign_name: string | null }>).map(
      (c) => ({ id: c.campaign_id, name: c.campaign_name ?? c.campaign_id }),
    ),
    contentTypes: [...contentSet].sort(),
    statuses: [...statusSet].sort(),
  };
}

export async function fetchDashboardData(
  filters: DashboardFilters,
): Promise<DashboardData> {
  const supabase = createServiceClient();
  const today = todayIso();
  const yesterday = yesterdayIso();
  const sparkStart = isoDaysAgo(29);

  // Try extended (with ads_status). 42703 → retry base. Page still renders.
  const buildPostsQuery = (cols: string) => {
    let q = (supabase as any).from("posts").select(cols).limit(5000);
    if (filters.campaign) q = q.eq("campaign_id", filters.campaign);
    if (filters.contentType) q = q.eq("content_type", filters.contentType);
    if (filters.status) q = q.ilike("workflow_status", `%${filters.status}%`);
    return q;
  };
  const fetchPosts = async () => {
    const ext = await buildPostsQuery(POSTS_COLS_EXTENDED);
    if (!ext.error) return ext;
    const code = String((ext.error as { code?: string }).code ?? "");
    if (code === "42703" || /column .* does not exist/i.test(ext.error.message ?? "")) {
      console.warn(
        "[dashboard] posts.ads_status missing on prod, falling back to base set. " +
          "Ad winners stays at 0 until that column is added.",
      );
      return await buildPostsQuery(POSTS_COLS_BASE);
    }
    return ext;
  };

  const [postsRes, creatorsRes] = await Promise.all([
    fetchPosts(),
    (supabase as any)
      .from("creators")
      .select("username, inf_name, category, followers, profile_pic")
      .limit(5000),
  ]);

  if (postsRes.error) {
    console.error("[dashboard] posts query failed:", postsRes.error);
    throw postsRes.error;
  }

  const posts = (postsRes.data ?? []) as Array<Record<string, unknown>>;
  const creators = (creatorsRes.data ?? []) as Array<Record<string, unknown>>;

  const categoryByUser = new Map<string, string>();
  for (const c of creators) {
    const u = String(c.username ?? "").toLowerCase();
    if (u) categoryByUser.set(u, String(c.category ?? ""));
  }

  // Pre-seed 6 months of zero buckets so the trend chart always renders.
  const monthlyMap = new Map<
    string,
    { reachOut: number; onboarded: number; posted: number }
  >();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(k, { reachOut: 0, onboarded: 0, posted: 0 });
  }
  const seenInfluencerByCategory = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const spendByCampaign = new Map<string, number>();

  // Accumulators
  let reachOutT = 0,
    onboardedT = 0,
    postedT = 0,
    deliveredT = 0;
  let reachOutY = 0,
    onboardedY = 0,
    postedY = 0,
    deliveredY = 0;

  const spendByDay = new Map<string, number>();
  for (let i = 0; i < 30; i++) spendByDay.set(isoDaysAgo(29 - i), 0);

  let reachOutCount = 0,
    onboardedCount = 0,
    postedCount = 0;
  let pendingContent = 0,
    paymentPending = 0,
    adWinners = 0;
  let paidCount = 0;
  let totalSpend = 0;
  const uniqueCreators = new Set<string>();
  const uniqueCampaigns = new Set<string>();
  const contentCounts = new Map<string, number>();

  const actions: ActionCounts = {
    needsEmail: 0,
    needsOrder: 0,
    awaitingPost: 0,
    noTracking: 0,
    noPartnership: 0,
    overdue: 0,
  };

  const filtersInfluencerType = (filters.influencerType ?? "").trim().toLowerCase();
  const filterDateFrom = filters.dateFrom ?? "";
  const filterDateTo = filters.dateTo ?? "";

  for (const p of posts) {
    const user = String(p.username ?? "").trim().toLowerCase();
    const camp = String(p.campaign_id ?? "").trim();
    const status = String(p.workflow_status ?? "").trim();
    const statusLow = status.toLowerCase();
    const commercials = Number(p.commercial_amount ?? 0);
    const payStatus = String(p.payment_status ?? "").trim().toLowerCase();
    const category = (categoryByUser.get(user) ?? "").toLowerCase();
    const reachOutDate = p.reach_out_date ? String(p.reach_out_date).slice(0, 10) : "";
    const postDate = p.post_date ? String(p.post_date).slice(0, 10) : "";
    const onboardDate = p.onboard_date ? String(p.onboard_date).slice(0, 10) : "";

    // Influencer-type (category substring) filter
    if (filtersInfluencerType) {
      const baseCat = category.split("(")[0].trim();
      if (!baseCat.includes(filtersInfluencerType)) continue;
    }

    // Date range filter — match if EITHER reachOutDate OR postDate is in range
    if (filterDateFrom || filterDateTo) {
      const dates = [reachOutDate, postDate].filter(Boolean);
      const any = dates.some((d) => {
        if (filterDateFrom && d < filterDateFrom) return false;
        if (filterDateTo && d > filterDateTo) return false;
        return true;
      });
      if (!any) continue;
    }

    // Today vs yesterday pulse
    if (reachOutDate === today) reachOutT++;
    else if (reachOutDate === yesterday) reachOutY++;
    if (onboardDate === today) onboardedT++;
    else if (onboardDate === yesterday) onboardedY++;
    if (postDate === today) postedT++;
    else if (postDate === yesterday) postedY++;

    // Delivered = posted that's also Delivered workflow OR has delivery_date today
    if (statusLow.includes("delivered")) {
      if (postDate === today) deliveredT++;
      else if (postDate === yesterday) deliveredY++;
    }

    // Spotlight sparkline — commercial spend per day window
    if (postDate >= sparkStart && commercials > 0) {
      spendByDay.set(postDate, (spendByDay.get(postDate) ?? 0) + commercials);
    }

    // Pipeline counters + monthly funnel bucket
    const month = reachOutDate ? reachOutDate.slice(0, 7) : "";
    if (statusLow.includes("reach out") || status === "") {
      reachOutCount++;
      if (month && monthlyMap.has(month)) monthlyMap.get(month)!.reachOut++;
    } else if (statusLow.includes("on board")) {
      onboardedCount++;
      pendingContent++;
      const m = onboardDate ? onboardDate.slice(0, 7) : month;
      if (m && monthlyMap.has(m)) monthlyMap.get(m)!.onboarded++;
    } else if (statusLow.includes("posted") || statusLow.includes("delivered")) {
      postedCount++;
      const m = postDate ? postDate.slice(0, 7) : month;
      if (m && monthlyMap.has(m)) monthlyMap.get(m)!.posted++;
    }

    // Payment lives on the parent post only — child deliverables share the
     // parent's settlement. Counting children inflates Pending/Paid totals.
    const isChild =
      p.deliverable_index != null && Number(p.deliverable_index) > 1;
    if (!isChild) {
      if (payStatus === "due" || payStatus === "not due") paymentPending++;
      if (payStatus === "done" || payStatus === "paid") paidCount++;
    }
    // Ad winners — once posts.ads_status exists on prod, the extended query
    // returns the column and this check populates the count. Until then,
    // `p.ads_status` is undefined and adWinners stays at 0.
    if (String(p.ads_status ?? "").toLowerCase() === "winner") adWinners++;

    // Campaign + spend KPIs
    if (user) uniqueCreators.add(user);
    if (camp) {
      uniqueCampaigns.add(camp);
      spendByCampaign.set(camp, (spendByCampaign.get(camp) ?? 0) + commercials);
    }
    totalSpend += commercials;
    const ct = String(p.content_type ?? "").trim() || "Other";
    contentCounts.set(ct, (contentCounts.get(ct) ?? 0) + 1);
    // Creator tier slice — count one creator per category (first time seen).
    if (user && !seenInfluencerByCategory.has(user)) {
      seenInfluencerByCategory.add(user);
      const cat = (categoryByUser.get(user) ?? "").split("(")[0].trim() || "Unsorted";
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }

    // Action chip counts
    if (statusLow.includes("on board") || statusLow.includes("reach out")) {
      if (!p.email) actions.needsEmail++;
      if (!p.order_id) actions.needsOrder++;
    }
    if (statusLow.includes("on board")) actions.awaitingPost++;
    if (p.order_id && !p.tracking_id) actions.noTracking++;
    if (
      adsRequired(p.ads_usage_rights as string | null) &&
      !(p.ad_partnership_valid as boolean | null) &&
      !String(p.partnership_id ?? "").trim()
    ) {
      actions.noPartnership++;
    }
    if (
      p.est_delivery &&
      String(p.est_delivery).slice(0, 10) < today &&
      !statusLow.includes("delivered") &&
      !statusLow.includes("posted")
    ) {
      actions.overdue++;
    }
  }

  const spendSpark: SparkPoint[] = [...spendByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  const totalSpendSpark = spendSpark.reduce((s, p) => s + p.value, 0);

  const conversionPct =
    reachOutCount + onboardedCount > 0
      ? Math.round((onboardedCount / (reachOutCount + onboardedCount)) * 100)
      : 0;
  const postRatePct =
    onboardedCount + postedCount > 0
      ? Math.round((postedCount / (onboardedCount + postedCount)) * 100)
      : 0;

  const pulse = (t: number, y: number): PulseStat => ({
    today: t,
    yesterday: y,
    delta: t - y,
  });

  const toSlices = (m: Map<string, number>): BreakdownSlice[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({
        label,
        value,
        color: SLICE_COLORS[i % SLICE_COLORS.length],
      }));

  const contentBreakdown: BreakdownSlice[] = toSlices(contentCounts);
  const categoryBreakdown: BreakdownSlice[] = toSlices(categoryCounts);
  const monthlyFunnel: MonthlyPoint[] = [...monthlyMap.entries()].map(([k, v]) => ({
    month: monthLabel(k),
    reachOut: v.reachOut,
    onboarded: v.onboarded,
    posted: v.posted,
  }));
  const spendsPerCampaign: RankedRow[] = [...spendByCampaign.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  const targetTotal = reachOutCount + onboardedCount + postedCount;
  const postingGoal = {
    target: targetTotal,
    achieved: postedCount,
    pct: targetTotal > 0 ? Math.round((postedCount / targetTotal) * 100) : 0,
  };

  // Top creators (by followers) + their post count within scope.
  const postCountByUser = new Map<string, number>();
  for (const p of posts) {
    const u = String(p.username ?? "").toLowerCase();
    if (u) postCountByUser.set(u, (postCountByUser.get(u) ?? 0) + 1);
  }
  const creatorByUser = new Map<string, Record<string, unknown>>();
  for (const c of creators) {
    const u = String(c.username ?? "").toLowerCase();
    if (u) creatorByUser.set(u, c);
  }
  const topCreators = [...uniqueCreators]
    .map((u) => {
      const c = creatorByUser.get(u) ?? {};
      return {
        username: u,
        name: (c.inf_name as string | null) ?? null,
        followers: Number(c.followers ?? 0) || null,
        category: (c.category as string | null) ?? null,
        profilePic: (c.profile_pic as string | null) ?? null,
        postCount: postCountByUser.get(u) ?? 0,
      };
    })
    .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
    .slice(0, 6);

  // Team leaderboard — group by onboarded_by; count Onboarded + Posted.
  const teamMap = new Map<string, { onboardings: number; posts: number }>();
  for (const p of posts) {
    const who = String(p.onboarded_by ?? "").trim();
    if (!who) continue;
    const statusLow = String(p.workflow_status ?? "").toLowerCase();
    const cur = teamMap.get(who) ?? { onboardings: 0, posts: 0 };
    if (statusLow.includes("on board") || statusLow.includes("posted") || statusLow.includes("delivered")) {
      cur.onboardings++;
    }
    if (statusLow.includes("posted") || statusLow.includes("delivered")) cur.posts++;
    teamMap.set(who, cur);
  }
  const teamLeaderboard = [...teamMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.onboardings - a.onboardings)
    .slice(0, 6);

  // Parent payment map — children inherit their parent's payment status so
  // a 3-deliverable collab where the parent is paid shows "Settled" on every
  // child card. Key = `${inf_id}|${collab_number}`.
  const parentPaymentByCollab = new Map<string, string>();
  for (const p of posts) {
    const idx = Number(p.deliverable_index ?? 1);
    if (idx > 1) continue; // child, skip
    const inf = String(p.inf_id ?? "");
    if (!inf) continue;
    const key = `${inf}|${Number(p.collab_number ?? 1)}`;
    parentPaymentByCollab.set(
      key,
      String(p.payment_status ?? "").toLowerCase(),
    );
  }

  // 4-stage mini-board — top 4 per stage, latest first.
  const daysBetween = (iso: string | null | undefined): number => {
    if (!iso) return 0;
    const then = Date.parse(String(iso));
    if (Number.isNaN(then)) return 0;
    const today = Date.now();
    return Math.max(0, Math.floor((today - then) / (1000 * 60 * 60 * 24)));
  };
  const toCard = (
    p: Record<string, unknown>,
    bucketKey: "reachOut" | "onBoard" | "posted" | "paid",
  ): StageCard => {
    const u = String(p.username ?? "").toLowerCase();
    const c = creatorByUser.get(u) ?? {};
    const reachOutDate = p.reach_out_date as string | null;
    const onboardDate = p.onboard_date as string | null;
    const postDate = p.post_date as string | null;
    const payLow = String(p.payment_status ?? "").toLowerCase();
    const dateForStage: Record<typeof bucketKey, string | null> = {
      reachOut: reachOutDate,
      onBoard: onboardDate,
      posted: postDate,
      paid: postDate,
    };
    // Resolve effective payment status — children read from their PARENT row
    // (payment lives on parent in Accounts Hub), parents read their own.
    const inf = String(p.inf_id ?? "");
    const idx = Number(p.deliverable_index ?? 1);
    const collabKey = inf ? `${inf}|${Number(p.collab_number ?? 1)}` : null;
    const parentPay =
      idx > 1 && collabKey ? (parentPaymentByCollab.get(collabKey) ?? "") : payLow;
    const effectivePay = idx > 1 ? parentPay : payLow;
    let stuckLabel: string;
    if (bucketKey === "reachOut") stuckLabel = "Not yet onboarded";
    else if (bucketKey === "onBoard") stuckLabel = "Not yet posted";
    else if (bucketKey === "paid")
      stuckLabel = effectivePay === "done" || effectivePay === "paid" ? "Settled" : "Payment pending";
    else stuckLabel = effectivePay === "done" || effectivePay === "paid" ? "Settled" : "Payment pending";
    const stageDate = dateForStage[bucketKey];
    return {
      postId: String(p.post_id_short ?? p.post_id ?? ""),
      username: String(p.username ?? ""),
      name: (c.inf_name as string | null) ?? null,
      profilePic: (c.profile_pic as string | null) ?? null,
      campaign: (p.campaign_id as string | null) ?? null,
      date: stageDate ?? reachOutDate,
      amount: p.commercial_amount != null ? Number(p.commercial_amount) : null,
      // `posts.logged_by` doesn't exist on prod yet — once it does, fall back
      // chain becomes logged_by (for Reach Out) → onboarded_by (for OB+).
      assignee: (p.onboarded_by as string | null) ?? null,
      assigneeLabel:
        bucketKey === "reachOut" ? "Reached out by" : "Onboarded by",
      daysStuck: daysBetween(stageDate),
      stuckLabel,
    };
  };
  const bucket = (
    cond: (s: string, pay: string, isChild: boolean) => boolean,
    bucketKey: "reachOut" | "onBoard" | "posted" | "paid",
  ) =>
    posts
      .filter((p) => {
        const isChild =
          p.deliverable_index != null && Number(p.deliverable_index) > 1;
        return cond(
          String(p.workflow_status ?? "").toLowerCase(),
          String(p.payment_status ?? "").toLowerCase(),
          isChild,
        );
      })
      .sort((a, b) => {
        const da = String(a.post_date ?? a.onboard_date ?? a.reach_out_date ?? "");
        const db = String(b.post_date ?? b.onboard_date ?? b.reach_out_date ?? "");
        return db.localeCompare(da);
      })
      .slice(0, 4)
      .map((p) => toCard(p, bucketKey));

  const stageBoard = {
    reachOut: bucket((s) => s.includes("reach out") || s === "", "reachOut"),
    onBoard: bucket((s) => s.includes("on board"), "onBoard"),
    // Posted column — every deliverable in posted/delivered (parent +
    // children). Lets the operator see all 3 cards for a 3-deliverable
    // collab even if the parent is already paid.
    posted: bucket(
      (s) => s.includes("posted") || s.includes("delivered"),
      "posted",
    ),
    // Payment column — every PARENT that's in posted/delivered (whether paid
    // or pending). Card sub-label = "Payment pending" / "Settled". Children
    // skipped here because payment lives on parent only.
    paid: bucket(
      (s, _pay, isChild) =>
        !isChild && (s.includes("posted") || s.includes("delivered")),
      "paid",
    ),
  };

  return {
    filters,
    pulse: {
      reachOut: pulse(reachOutT, reachOutY),
      onboarded: pulse(onboardedT, onboardedY),
      posted: pulse(postedT, postedY),
      delivered: pulse(deliveredT, deliveredY),
    },
    actions,
    spotlight: {
      totalSpend: totalSpendSpark || totalSpend,
      spendSpark,
    },
    pipeline: {
      reachOut: reachOutCount,
      onboarded: onboardedCount,
      posted: postedCount,
      pendingContent,
      paymentPending,
      adWinners,
      conversionPct,
      postRatePct,
    },
    campaign: {
      totalCreators: uniqueCreators.size,
      activeCampaigns: uniqueCampaigns.size,
      totalSpend,
      paidCount,
    },
    contentBreakdown,
    categoryBreakdown,
    workflowFunnel: {
      reachOut: reachOutCount,
      onboarded: onboardedCount,
      posted: postedCount,
    },
    monthlyFunnel,
    spendsPerCampaign,
    postingGoal,
    topCreators,
    teamLeaderboard,
    stageBoard,
  };
}
