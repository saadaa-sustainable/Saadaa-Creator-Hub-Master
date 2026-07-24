import { createServiceClient } from "@/lib/supabase/server";
import { todayIstIso } from "@/lib/payable-cycle";
import { isVoidedStatus } from "@/lib/workflow";
import { buildDailySnapshots, type DailySnapshot } from "./eod-snapshot-data";
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
  "id",
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
  "logged_by",
  "posted_by",
  "post_link",
  "download_link",
  "raw_dump",
  "inf_id",
  "collab_number",
  "deliverable_index",
  "deliverable_type",
  "content_type",
  "tracking_id",
  "bank_number",
  "ifsc",
  "ads_usage_rights",
  "commercial_amount",
  "collab_type",
  "reels",
  "static_posts",
  "stories",
  "payment_status",
  "partnership_id",
  "is_test",
].join(",");

const CREATORS_SELECT = [
  "inf_id",
  "username",
  "inf_name",
  "profile_pic",
  "category",
  "followers",
  "gender",
  "state",
  "language",
  "instagram_link",
  "er",
  "avg_likes",
  "creator_type",
  "agency_name",
].join(",");

export async function fetchMyDashboardData(userEmail: string): Promise<{
  posts: MyPost[];
  kpi: MyDashboardKpi;
  pendingActions: PendingAction[];
  snapshots: DailySnapshot[];
  filterOptions: MyDashboardFilterOptions;
  leaderboard: TeamLeaderboardEntry[];
}> {
  const supabase = createServiceClient();

  // Ownership scope — a member owns a row at ANY stage they touched: reach-out
  // rows carry ONLY logged_by (onboarded_by stays null until onboarding), the
  // onboard belongs to onboarded_by, and the posting to posted_by. Scoping by
  // onboarded_by alone dropped every reach-out (My Dashboard showed 0 while
  // the Journey team filter showed hundreds).
  const member = userEmail;
  const { data, error } = await (supabase as any)
    .from("posts")
    .select(POSTS_SELECT)
    .or(
      `onboarded_by.eq.${member},logged_by.eq.${member},posted_by.eq.${member}`,
    )
    // High cap — the old 500 silently truncated (same bug as the stage queues).
    .order("reach_out_date", { ascending: false, nullsFirst: false })
    .limit(10_000);

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
          inf_id: (c.inf_id as string | null) ?? null,
          inf_name: (c.inf_name as string | null) ?? null,
          profile_pic: (c.profile_pic as string | null) ?? null,
          category: (c.category as string | null) ?? null,
          followers: typeof c.followers === "number" ? c.followers : null,
          gender: (c.gender as string | null) ?? null,
          state: (c.state as string | null) ?? null,
          language: (c.language as string | null) ?? null,
          instagram_link: (c.instagram_link as string | null) ?? null,
          er: typeof c.er === "number" ? c.er : null,
          avg_likes: typeof c.avg_likes === "number" ? c.avg_likes : null,
          creator_type: (c.creator_type as string | null) ?? null,
          agency_name: (c.agency_name as string | null) ?? null,
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

  // Per-stage ownership (mirrors the stage pages): a reach-out belongs to the
  // member who LOGGED it (logged_by; legacy rows fall back to onboarded_by),
  // the onboard/RTO to the onboarder, and the posting to the posting-form
  // submitter (older posted rows: null posted_by → the onboarder).
  const norm = (v: unknown) => String(v ?? "").trim();
  const reachOwner = (p: {
    logged_by?: string | null;
    onboarded_by?: string | null;
  }) => norm(p.logged_by) || norm(p.onboarded_by);
  const onboardOwner = (p: {
    logged_by?: string | null;
    onboarded_by?: string | null;
  }) => norm(p.onboarded_by) || norm(p.logged_by);
  const postOwner = (p: {
    logged_by?: string | null;
    onboarded_by?: string | null;
    posted_by?: string | null;
  }) => norm(p.posted_by) || onboardOwner(p);

  // A row belongs on MY dashboard only while I own its CURRENT stage. A
  // reach-out I logged that someone else onboarded/posted is THEIR active /
  // posted work now — showing it here too made the board, workload and stage
  // mix disagree with the top KPIs + leaderboard (which already scope
  // per-stage) and double-showed the collab on two members' dashboards.
  const ownsCurrentStage = (p: MyPost): boolean => {
    const s = p.workflow_status ?? "";
    if (s === "Reach Out") return reachOwner(p) === member;
    if ((PENDING_POST_STATUSES as readonly string[]).includes(s))
      return onboardOwner(p) === member;
    if ((POSTED_STATUSES as readonly string[]).includes(s))
      return postOwner(p) === member;
    if ((RTO_STATUSES as readonly string[]).includes(s))
      return onboardOwner(p) === member;
    // Unknown/legacy status — keep if the member touched any stage.
    return (
      reachOwner(p) === member ||
      onboardOwner(p) === member ||
      postOwner(p) === member
    );
  };
  const ownedPosts = posts.filter(ownsCurrentStage);

  const { data: leaderboardRows, error: leaderboardError } = await (
    supabase as any
  )
    .from("posts")
    .select(
      "onboarded_by, logged_by, posted_by, workflow_status, payment_status",
    )
    .limit(10_000);

  if (leaderboardError) {
    console.warn("[my-dashboard] leaderboard query failed:", leaderboardError);
  }

  const leaderboardMap = new Map<string, TeamLeaderboardEntry>();
  const bump = (name: string, field: "active" | "posted" | "paid"): void => {
    if (!name) return;
    const entry =
      leaderboardMap.get(name) ??
      ({
        name,
        active: 0,
        posted: 0,
        paid: 0,
        score: 0,
      } satisfies TeamLeaderboardEntry);
    entry[field]++;
    entry.score = entry.posted * 5 + entry.paid * 8 + entry.active * 2;
    leaderboardMap.set(name, entry);
  };
  for (const row of (leaderboardRows ?? []) as Array<{
    onboarded_by: string | null;
    logged_by: string | null;
    posted_by: string | null;
    workflow_status: string | null;
    payment_status: string | null;
  }>) {
    const status = row.workflow_status ?? "";
    if ((ACTIVE_STATUSES as readonly string[]).includes(status)) {
      bump(
        status === "Reach Out" ? reachOwner(row) : onboardOwner(row),
        "active",
      );
    }
    if ((POSTED_STATUSES as readonly string[]).includes(status)) {
      bump(postOwner(row), "posted");
    }
    if (row.payment_status === "Done") bump(onboardOwner(row), "paid");
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

  // KPI buckets stay status-based, but each bucket only counts rows the member
  // owns AT THAT STAGE (a reach-out they logged that someone else onboarded
  // counts in the other member's Pending Post, not theirs).
  for (const p of ownedPosts) {
    const s = p.workflow_status ?? "";
    const mineReach = reachOwner(p) === member;
    const mineOnboard = onboardOwner(p) === member;
    const minePost = postOwner(p) === member;

    if (s === "Reach Out" && mineReach) {
      kpi.myActive++;
      kpi.totalReachouts++;
    }
    if (
      (PENDING_POST_STATUSES as readonly string[]).includes(s) &&
      mineOnboard
    ) {
      kpi.myActive++;
      kpi.pendingPost++;
    }
    if ((POSTED_STATUSES as readonly string[]).includes(s) && minePost)
      kpi.posted++;
    if ((RTO_STATUSES as readonly string[]).includes(s) && mineOnboard)
      kpi.rtos++;

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
  const today = todayIstIso();

  const pendingActions: PendingAction[] = [];

  for (const p of ownedPosts) {
    // Chase list = the onboarder's job — skip rows the member only logged.
    if (onboardOwner(p) !== member) continue;
    const s = p.workflow_status ?? "";

    // Overdue delivery: On Board or Order Sent + est_delivery is set + est_delivery < today
    if (
      (PENDING_POST_STATUSES as readonly string[]).includes(s) &&
      p.est_delivery
    ) {
      const delivery = String(p.est_delivery).slice(0, 10);
      if (delivery < today) {
        const daysOverdue = Math.floor(
          (Date.parse(`${today}T00:00:00Z`) -
            Date.parse(`${delivery}T00:00:00Z`)) /
            86400000,
        );
        pendingActions.push({
          post: p,
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
        const delivery = String(p.est_delivery).slice(0, 10);
        if (delivery < today) {
          daysOverdue = Math.floor(
            (Date.parse(`${today}T00:00:00Z`) -
              Date.parse(`${delivery}T00:00:00Z`)) /
              86400000,
          );
        }
      }
      pendingActions.push({
        post: p,
        label: "Awaiting post",
        daysOverdue,
      });
    }
  }

  // Sort by most overdue first, then awaiting post
  pendingActions.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    posts: ownedPosts,
    kpi,
    pendingActions: pendingActions.slice(0, 15),
    snapshots: buildDailySnapshots(posts, member, today),
    filterOptions: {
      campaigns: Array.from(
        new Set(
          ownedPosts.map((p) => p.campaign_id).filter(Boolean) as string[],
        ),
      ).sort(),
      statuses: Array.from(
        new Set(
          ownedPosts.map((p) => p.workflow_status).filter(Boolean) as string[],
        ),
      ).sort(),
      tiers: Array.from(
        new Set(
          ownedPosts
            .map((p) => p.creator?.category)
            .filter(Boolean) as string[],
        ),
      ).sort(),
    },
    leaderboard: Array.from(leaderboardMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5),
  };
}
