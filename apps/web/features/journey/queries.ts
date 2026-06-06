import { createServiceClient } from "@/lib/supabase/server";
import type {
  JourneyCard,
  JourneyColumn,
  JourneyColumnId,
  JourneyCreator,
  JourneyFilterOptions,
  JourneyFilters,
  JourneyFunnel,
  JourneyKpi,
  JourneyPost,
} from "./types";

const POSTS_SELECT = [
  "post_id",
  "username",
  "campaign_id",
  "workflow_status",
  "reach_out_date",
  "onboard_date",
  "post_date",
  "est_delivery",
  "order_id",
  "order_status",
  "payment_status",
  "deliverable_index",
  "content_type",
  "ads_usage_rights",
  "collab_number",
  "collab_id",
  "inf_id",
  "onboarded_by",
].join(",");

const CREATORS_SELECT = [
  "username",
  "inf_name",
  "profile_pic",
  "category",
  "followers",
  "state",
].join(",");

/** Ordered column definitions — left → right in the kanban. */
export const JOURNEY_COLUMNS: Omit<JourneyColumn, "cards">[] = [
  {
    id: "reach-out",
    title: "Reach Out",
    accent: "#B57514",
    statuses: ["Reach Out"],
  },
  {
    id: "on-board",
    title: "Onboard",
    accent: "#4F7C4D",
    statuses: ["On Board", "Order Sent"],
  },
  {
    id: "posted",
    title: "Posted",
    accent: "#3B6FD4",
    statuses: ["Posted", "Delivered"],
  },
  {
    id: "payment",
    title: "Payment",
    accent: "#F0C61E",
    statuses: ["Posted", "Delivered"],
  },
];

export async function fetchJourneyData(filters: JourneyFilters): Promise<{
  columns: JourneyColumn[];
  kpi: JourneyKpi;
  funnel: JourneyFunnel;
}> {
  const supabase = createServiceClient();

  // Build posts query — all workflow statuses, campaign filter applied server-side.
  let postsQuery = (supabase as any)
    .from("posts")
    .select(POSTS_SELECT)
    .limit(2000);

  if (filters.campaign) {
    postsQuery = postsQuery.eq("campaign_id", filters.campaign);
  }

  const { data: postsData, error: postsError } = await postsQuery;

  if (postsError) {
    console.error("[journey] posts query failed:", postsError);
    throw postsError;
  }

  const posts = (postsData ?? []) as Array<Record<string, unknown>>;

  // Collect unique usernames for creator join.
  const usernames = [
    ...new Set(
      posts
        .map((p) => String(p.username ?? "").trim())
        .filter(Boolean),
    ),
  ];

  // Fetch creators in one batch — username IN (...)
  let creatorMap = new Map<string, JourneyCreator>();
  if (usernames.length > 0) {
    const { data: creatorsData, error: creatorsError } = await (supabase as any)
      .from("creators")
      .select(CREATORS_SELECT)
      .in("username", usernames)
      .limit(2000);

    if (creatorsError) {
      // Non-fatal — cards render with initials fallback.
      console.warn("[journey] creators query failed:", creatorsError);
    } else {
      for (const c of (creatorsData ?? []) as Array<Record<string, unknown>>) {
        const uname = String(c.username ?? "").trim().toLowerCase();
        if (uname) {
          creatorMap.set(uname, {
            inf_name: (c.inf_name as string | null) ?? null,
            profile_pic: (c.profile_pic as string | null) ?? null,
            category: (c.category as string | null) ?? null,
            followers: typeof c.followers === "number" ? c.followers : null,
            state: (c.state as string | null) ?? null,
          });
        }
      }
    }
  }

  // Group posts into columns.
  const reachOutBucket: JourneyCard[] = [];
  const onBoardBucket: JourneyCard[] = [];
  const postedBucket: JourneyCard[] = [];
  const paymentBucket: JourneyCard[] = [];

  let activeCount = 0;
  let postedCount = 0;
  let closedCount = 0;

  // Funnel — cumulative collab counts (parent rows only). Each collab is
  // counted at every stage it has reached, so rates are monotonic.
  let reachedCount = 0;
  let onboardedCount = 0;
  let postedFunnelCount = 0;
  let paidCount = 0;

  for (const p of posts) {
    const statusRaw = String(p.workflow_status ?? "").trim();
    const statusKey = statusRaw.toLowerCase();

    // Accumulate KPI counts.
    if (statusKey.includes("reach out") || statusKey.includes("on board")) {
      activeCount++;
    } else if (statusKey.includes("posted") || statusKey.includes("delivered")) {
      postedCount++;
    } else if (
      statusKey === "rto" ||
      statusKey === "cancelled" ||
      statusKey.startsWith("rto")
    ) {
      closedCount++;
    }

    // Funnel — parent collabs only. Determine the furthest stage reached, then
    // increment every prior stage too (cumulative). RTO/Cancelled collabs that
    // had been onboarded/posted still count toward those stages.
    const isParentRow =
      p.deliverable_index == null || Number(p.deliverable_index) === 1;
    if (isParentRow) {
      const reachedOnboard =
        statusKey.includes("on board") ||
        statusKey === "order sent" ||
        statusKey.includes("posted") ||
        statusKey.includes("delivered") ||
        statusKey.startsWith("rto") ||
        statusKey === "cancelled";
      const reachedPost =
        statusKey.includes("posted") || statusKey.includes("delivered");
      const reachedPaid =
        String(p.payment_status ?? "").trim().toLowerCase() === "done";

      reachedCount++; // every parent collab entered at Reach Out
      if (reachedOnboard) onboardedCount++;
      if (reachedPost) postedFunnelCount++;
      if (reachedPaid) paidCount++;
    }

    const username = String(p.username ?? "").trim().toLowerCase();
    const creator = creatorMap.get(username) ?? null;

    const card: JourneyCard = {
      post_id: String(p.post_id ?? ""),
      username: (p.username as string | null) ?? null,
      campaign_id: (p.campaign_id as string | null) ?? null,
      workflow_status: statusRaw || null,
      reach_out_date: (p.reach_out_date as string | null) ?? null,
      onboard_date: (p.onboard_date as string | null) ?? null,
      post_date: (p.post_date as string | null) ?? null,
      est_delivery: (p.est_delivery as string | null) ?? null,
      order_id: (p.order_id as string | null) ?? null,
      order_status: (p.order_status as string | null) ?? null,
      payment_status: (p.payment_status as string | null) ?? null,
      deliverable_index:
        typeof p.deliverable_index === "number" ? p.deliverable_index : null,
      content_type: (p.content_type as string | null) ?? null,
      ads_usage_rights: (p.ads_usage_rights as string | null) ?? null,
      collab_number:
        typeof p.collab_number === "number" ? p.collab_number : null,
      collab_id: (p.collab_id as string | null) ?? null,
      inf_id: (p.inf_id as string | null) ?? null,
      onboarded_by: (p.onboarded_by as string | null) ?? null,
      inf_name: creator?.inf_name ?? null,
      creator,
    };

    // Column 1: Reach Out
    if (statusKey.includes("reach out") || statusKey === "") {
      reachOutBucket.push(card);
      continue;
    }

    // Column 2: On Board (includes Order Sent)
    if (statusKey.includes("on board") || statusKey === "order sent") {
      onBoardBucket.push(card);
      continue;
    }

    // Column 3: Posted — every deliverable in posted/delivered
    if (statusKey.includes("posted") || statusKey.includes("delivered")) {
      postedBucket.push(card);
    }

    // Column 4: Payment — parent rows only (deliverable_index IS NULL or = 1)
    // that are in posted/delivered status.
    if (statusKey.includes("posted") || statusKey.includes("delivered")) {
      const isChild =
        p.deliverable_index != null && Number(p.deliverable_index) > 1;
      if (!isChild) {
        paymentBucket.push(card);
      }
    }
  }

  // Assemble final column array — preserving JOURNEY_COLUMNS order.
  const bucketMap = new Map<JourneyColumnId, JourneyCard[]>([
    ["reach-out", reachOutBucket],
    ["on-board", onBoardBucket],
    ["posted", postedBucket],
    ["payment", paymentBucket],
  ]);

  const columns: JourneyColumn[] = JOURNEY_COLUMNS.map((col) => ({
    ...col,
    cards: bucketMap.get(col.id) ?? [],
  }));

  const kpi: JourneyKpi = {
    inPipeline: posts.length,
    active: activeCount,
    posted: postedCount,
    closed: closedCount,
  };

  const rate = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

  const funnel: JourneyFunnel = {
    reached: reachedCount,
    onboarded: onboardedCount,
    posted: postedFunnelCount,
    paid: paidCount,
    reachToOnboard: rate(onboardedCount, reachedCount),
    onboardToPost: rate(postedFunnelCount, onboardedCount),
    postToPayment: rate(paidCount, postedFunnelCount),
  };

  return { columns, kpi, funnel };
}

export async function fetchJourneyFilterOptions(): Promise<JourneyFilterOptions> {
  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from("campaigns")
    .select("campaign_id, campaign_name")
    .order("campaign_id", { ascending: false })
    .limit(500);

  return {
    campaigns: (
      (data ?? []) as Array<{ campaign_id: string; campaign_name: string | null }>
    ).map((c) => ({
      id: c.campaign_id,
      name: c.campaign_name ?? c.campaign_id,
    })),
  };
}
