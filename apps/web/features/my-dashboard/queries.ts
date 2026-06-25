import { createServiceClient } from "@/lib/supabase/server";
import { isVoidedStatus } from "@/lib/workflow";
import type {
  MyDashboardFilterOptions,
  MyDashboardKpi,
  MyPost,
  PendingAction,
  TeamLeaderboardEntry,
} from "./types";

const ACTIVE_STATUSES = ["Reach Out", "On Board", "Order Sent"] as const;
const PENDING_POST_STATUSES = ["On Board", "Order Sent"] as const;
const POSTED_STATUSES = ["Posted", "Delivered"] as const;
const RTO_STATUSES = [
  "RTO",
  "Cancelled",
  "RTO - Reverse Picked",
  "RTO - Delivered",
] as const;

const POSTS_SELECT = [
  "post_id",
  "post_id_short",
  "collab_id",
  "username",
  "campaign_id",
  "workflow_status",
  "reach_out_date",
  "onboard_date",
  "post_date",
  "est_delivery",
  "order_id",
  "order_status",
  "onboarded_by",
  "post_link",
  "download_link",
  "raw_dump",
  "inf_id",
  "collab_number",
  "deliverable_index",
  "ads_usage_rights",
  "commercial_amount",
  "collab_type",
  "reels",
  "static_posts",
  "stories",
  "payment_status",
  "partnership_id",
].join(",");

const CREATORS_SELECT = [
  "username",
  "inf_name",
  "profile_pic",
  "category",
  "followers",
].join(",");

export async function fetchMyDashboardData(userEmail: string): Promise<{
  posts: MyPost[];
  kpi: MyDashboardKpi;
  pendingActions: PendingAction[];
  filterOptions: MyDashboardFilterOptions;
  leaderboard: TeamLeaderboardEntry[];
}> {
  const supabase = createServiceClient();

  const { data, error } = await (supabase as any)
    .from("posts")
    .select(POSTS_SELECT)
    .eq("onboarded_by", userEmail)
    .order("reach_out_date", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[my-dashboard] posts query failed:", error);
    throw error;
  }

  // Voided (offboarded) collabs are excluded from personal workload stats.
  const basePosts = ((data ?? []) as MyPost[]).filter(
    (p) => !isVoidedStatus(p.workflow_status),
  );

  const usernames = [
    ...new Set(
      basePosts.map((p) => String(p.username ?? "").trim()).filter(Boolean),
    ),
  ];
  const creatorMap = new Map<string, NonNullable<MyPost["creator"]>>();
  if (usernames.length > 0) {
    const { data: creatorsData, error: creatorsError } = await (supabase as any)
      .from("creators")
      .select(CREATORS_SELECT)
      .in("username", usernames)
      .limit(1000);

    if (creatorsError) {
      console.warn("[my-dashboard] creators query failed:", creatorsError);
    } else {
      for (const c of (creatorsData ?? []) as Array<Record<string, unknown>>) {
        const username = String(c.username ?? "")
          .trim()
          .toLowerCase();
        if (!username) continue;
        creatorMap.set(username, {
          inf_name: (c.inf_name as string | null) ?? null,
          profile_pic: (c.profile_pic as string | null) ?? null,
          category: (c.category as string | null) ?? null,
          followers: typeof c.followers === "number" ? c.followers : null,
        });
      }
    }
  }

  // Collab total — sum commercial_amount per (inf_id, collab_number). After
  // the equal-split rule, each row holds a fraction of the agreed amount, so
  // displaying `commercial_amount` directly under-reports per card.
  const collabInfIds = Array.from(
    new Set(basePosts.map((p) => p.inf_id).filter(Boolean) as string[]),
  );
  const collabTotalMap = new Map<string, number>();
  if (collabInfIds.length > 0) {
    const { data: sibRows } = await (supabase as any)
      .from("posts")
      .select("inf_id, collab_number, commercial_amount")
      .in("inf_id", collabInfIds);
    for (const s of (sibRows ?? []) as Array<{
      inf_id: string | null;
      collab_number: number | null;
      commercial_amount: number | null;
    }>) {
      // Reach-out rows (NULL collab_number) are not a collab — exclude them so
      // they don't inflate a fabricated "|1" bucket.
      if (s.collab_number == null) continue;
      const key = `${s.inf_id ?? ""}|${Number(s.collab_number)}`;
      collabTotalMap.set(
        key,
        (collabTotalMap.get(key) ?? 0) + Number(s.commercial_amount ?? 0),
      );
    }
  }

  const posts = basePosts.map((p) => {
    const creator =
      creatorMap.get(
        String(p.username ?? "")
          .trim()
          .toLowerCase(),
      ) ?? null;
    const key =
      p.collab_number != null
        ? `${p.inf_id ?? ""}|${Number(p.collab_number)}`
        : null;
    const total = key ? collabTotalMap.get(key) : undefined;
    return {
      ...p,
      commercial_amount: total ?? p.commercial_amount ?? 0,
      inf_name: creator?.inf_name ?? p.inf_name ?? null,
      creator,
    };
  });

  const { data: leaderboardRows, error: leaderboardError } = await (
    supabase as any
  )
    .from("posts")
    .select("onboarded_by, workflow_status, payment_status")
    .not("onboarded_by", "is", null)
    .limit(2000);

  if (leaderboardError) {
    console.warn("[my-dashboard] leaderboard query failed:", leaderboardError);
  }

  const leaderboardMap = new Map<string, TeamLeaderboardEntry>();
  for (const row of (leaderboardRows ?? []) as Array<{
    onboarded_by: string | null;
    workflow_status: string | null;
    payment_status: string | null;
  }>) {
    const name = String(row.onboarded_by ?? "").trim();
    if (!name) continue;
    const entry =
      leaderboardMap.get(name) ??
      ({
        name,
        active: 0,
        posted: 0,
        paid: 0,
        score: 0,
      } satisfies TeamLeaderboardEntry);
    const status = row.workflow_status ?? "";
    if ((ACTIVE_STATUSES as readonly string[]).includes(status)) entry.active++;
    if ((POSTED_STATUSES as readonly string[]).includes(status)) entry.posted++;
    if (row.payment_status === "Done") entry.paid++;
    entry.score = entry.posted * 5 + entry.paid * 8 + entry.active * 2;
    leaderboardMap.set(name, entry);
  }

  // Compute KPI counts
  const kpi: MyDashboardKpi = {
    myActive: 0,
    pendingPost: 0,
    posted: 0,
    rtos: 0,
    totalCampaigns: 0,
    activeCampaigns: 0,
    totalReachouts: 0,
  };

  const allCampaigns = new Set<string>();
  const activeCampaignSet = new Set<string>();

  for (const p of posts) {
    const s = p.workflow_status ?? "";
    if ((ACTIVE_STATUSES as readonly string[]).includes(s)) kpi.myActive++;
    if ((PENDING_POST_STATUSES as readonly string[]).includes(s))
      kpi.pendingPost++;
    if ((POSTED_STATUSES as readonly string[]).includes(s)) kpi.posted++;
    if ((RTO_STATUSES as readonly string[]).includes(s)) kpi.rtos++;
    if (s === "Reach Out") kpi.totalReachouts++;

    const camp = String(p.campaign_id ?? "").trim();
    if (camp) {
      allCampaigns.add(camp);
      if ((ACTIVE_STATUSES as readonly string[]).includes(s)) {
        activeCampaignSet.add(camp);
      }
    }
  }

  kpi.totalCampaigns = allCampaigns.size;
  kpi.activeCampaigns = activeCampaignSet.size;

  // Compute pending actions
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pendingActions: PendingAction[] = [];

  for (const p of posts) {
    const s = p.workflow_status ?? "";

    // Overdue delivery: On Board or Order Sent + est_delivery is set + est_delivery < today
    if (
      (PENDING_POST_STATUSES as readonly string[]).includes(s) &&
      p.est_delivery
    ) {
      const delivery = new Date(p.est_delivery);
      delivery.setHours(0, 0, 0, 0);
      if (delivery < today) {
        const daysOverdue = Math.floor(
          (today.getTime() - delivery.getTime()) / 86400000,
        );
        pendingActions.push({
          post_id: p.post_id,
          inf_name: null,
          username: p.username,
          campaign_id: p.campaign_id,
          workflow_status: p.workflow_status,
          est_delivery: p.est_delivery,
          post_date: p.post_date,
          label: "Overdue delivery",
          daysOverdue,
        });
      }
    }

    // Awaiting post: Delivered + no post_date
    if (s === "Delivered" && !p.post_date) {
      // Days overdue: use est_delivery if available, else 0
      let daysOverdue = 0;
      if (p.est_delivery) {
        const delivery = new Date(p.est_delivery);
        delivery.setHours(0, 0, 0, 0);
        if (delivery < today) {
          daysOverdue = Math.floor(
            (today.getTime() - delivery.getTime()) / 86400000,
          );
        }
      }
      pendingActions.push({
        post_id: p.post_id,
        inf_name: null,
        username: p.username,
        campaign_id: p.campaign_id,
        workflow_status: p.workflow_status,
        est_delivery: p.est_delivery,
        post_date: p.post_date,
        label: "Awaiting post",
        daysOverdue,
      });
    }
  }

  // Sort by most overdue first, then awaiting post
  pendingActions.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    posts,
    kpi,
    pendingActions: pendingActions.slice(0, 15),
    filterOptions: {
      campaigns: Array.from(
        new Set(posts.map((p) => p.campaign_id).filter(Boolean) as string[]),
      ).sort(),
      statuses: Array.from(
        new Set(
          posts.map((p) => p.workflow_status).filter(Boolean) as string[],
        ),
      ).sort(),
      tiers: Array.from(
        new Set(
          posts.map((p) => p.creator?.category).filter(Boolean) as string[],
        ),
      ).sort(),
    },
    leaderboard: Array.from(leaderboardMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5),
  };
}
