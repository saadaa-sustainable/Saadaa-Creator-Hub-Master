import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { isVoidedStatus } from "@/lib/workflow";
import { computeJourney } from "./compute";
import type {
  JourneyCard,
  JourneyColumn,
  JourneyCreator,
  JourneyFilterOptions,
  JourneyFilters,
  JourneyFunnel,
  JourneyKpi,
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
  "logged_by",
  "partnership_status",
].join(",");

const CREATORS_SELECT = [
  "username",
  "inf_name",
  "profile_pic",
  "category",
  "followers",
  "state",
  "is_active",
].join(",");


export async function fetchJourneyData(filters: JourneyFilters): Promise<{
  columns: JourneyColumn[];
  kpi: JourneyKpi;
  funnel: JourneyFunnel;
  /** Flat, non-void card list — the client re-derives columns/KPI/funnel from
   *  this after applying its (unpersisted) Team Member / Tier / etc. filters. */
  cards: JourneyCard[];
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

  // Voided (offboarded) collabs are removed from the journey board + funnel.
  const posts = ((postsData ?? []) as Array<Record<string, unknown>>).filter(
    (p) => !isVoidedStatus(p.workflow_status as string | null),
  );

  // Collect unique usernames for creator join.
  const usernames = [
    ...new Set(
      posts
        .map((p) => String(p.username ?? "").trim())
        .filter(Boolean),
    ),
  ];

  // Fetch creators in one batch — username IN (...)
  const creatorMap = new Map<string, JourneyCreator>();
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
            is_active: c.is_active == null ? null : Boolean(c.is_active),
          });
        }
      }
    }
  }

  // Build the flat card list (creator-joined). Columns, KPI and funnel are all
  // derived from this single set by computeJourney — the same function the
  // client re-runs after applying its filters, so the two never disagree.
  const cards: JourneyCard[] = posts.map((p) => {
    const username = String(p.username ?? "").trim().toLowerCase();
    const creator = creatorMap.get(username) ?? null;
    return {
      post_id: String(p.post_id ?? ""),
      username: (p.username as string | null) ?? null,
      campaign_id: (p.campaign_id as string | null) ?? null,
      workflow_status: String(p.workflow_status ?? "").trim() || null,
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
      logged_by: (p.logged_by as string | null) ?? null,
      partnership_status: (p.partnership_status as string | null) ?? null,
      inf_name: creator?.inf_name ?? null,
      creator,
    };
  });

  const { columns, kpi, funnel } = computeJourney(cards);
  return { columns, kpi, funnel, cards };
}

export const fetchJourneyFilterOptions = unstable_cache(
  async (): Promise<JourneyFilterOptions> => {
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
  },
  ["journey-filter-options"],
  { revalidate: 300, tags: ["campaigns"] },
);
