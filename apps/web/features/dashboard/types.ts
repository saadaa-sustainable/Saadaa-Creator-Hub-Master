/**
 * Dashboard types — mirrors legacy `getDashboardStatsFiltered` shape with
 * the new analytics enhancements (sparkline, action chip routing).
 */
export interface DashboardFilters {
  campaign?: string;
  status?: string;
  contentType?: string;
  influencerType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface DashboardFilterOptions {
  campaigns: { id: string; name: string }[];
  contentTypes: string[];
  statuses: string[];
}

export interface PulseStat {
  today: number;
  yesterday: number;
  delta: number;
}

export interface ActionCounts {
  needsEmail: number;
  needsOrder: number;
  awaitingPost: number;
  noTracking: number;
  noPartnership: number;
  overdue: number;
}

export interface SparkPoint {
  date: string;
  value: number;
}

export interface BreakdownSlice {
  label: string;
  value: number;
  color: string;
}

export interface MonthlyPoint {
  month: string;
  reachOut: number;
  onboarded: number;
  posted: number;
}

/** One day of the 30-day Overview activity trend (event-dated: each stage
 * event counts on the day it happened, independent of current stage). */
export interface ActivityPoint {
  date: string; // ISO yyyy-mm-dd
  reachOut: number;
  onboarded: number;
  posted: number;
}

export interface RankedRow {
  label: string;
  value: number;
}

/**
 * Per-channel reach-out analytics — one of these for inbound, one for outbound.
 * Split off `posts.reachout_direction` ('inbound' = creator approached us via the
 * inbound roster; everything else = outbound, our team reached out). Funnel counts
 * are per-deliverable row (same basis as the rest of the dashboard); `creators` is
 * the distinct creator count in the channel.
 */
export interface ChannelStats {
  reachOut: number;
  onboarded: number;
  posted: number;
  delivered: number;
  creators: number;
  spend: number;
  /** posted / (reachOut + onboarded + posted), as a whole percent. */
  conversionPct: number;
}

/**
 * Per-campaign focus metrics — populated only when a single campaign is selected
 * in the dashboard filter. Shows the onboarding-cap funnel for that campaign:
 * how many creators were reached out, how many of those onboarded (vs the cap),
 * how many are still un-onboarded, and how many have posted. `unonboarded` =
 * reachedOut − onboarded (reached out but never onboarded-active; includes
 * voided/cancelled leftovers since they were still reach-outs).
 */
export interface CampaignFocus {
  campaignId: string;
  campaignName: string | null;
  cap: number;
  reachedOut: number;
  onboarded: number;
  unonboarded: number;
  posted: number;
}

export interface DashboardData {
  filters: DashboardFilters;
  /** Set only when exactly one campaign is selected in the filter; else null. */
  campaignFocus: CampaignFocus | null;
  pulse: {
    reachOut: PulseStat;
    onboarded: PulseStat;
    posted: PulseStat;
    delivered: PulseStat;
  };
  actions: ActionCounts;
  spotlight: {
    totalSpend: number;
    spendSpark: SparkPoint[];
  };
  pipeline: {
    reachOut: number;
    onboarded: number;
    posted: number;
    pendingContent: number;
    paymentPending: number;
    adWinners: number;
    conversionPct: number;
    postRatePct: number;
  };
  campaign: {
    totalCreators: number;
    activeCampaigns: number;
    totalSpend: number;
    paidCount: number;
  };
  /** Inbound vs outbound reach-out analytics, computed separately. */
  channels: {
    inbound: ChannelStats;
    outbound: ChannelStats;
  };
  /** Donut slices for content_type distribution. */
  contentBreakdown: BreakdownSlice[];
  /** Donut slices for creator tier (Nano/Micro/...) distribution. */
  categoryBreakdown: BreakdownSlice[];
  /** 3-line horizontal funnel: Reach Out → On Board → Posted, with rate %. */
  workflowFunnel: {
    reachOut: number;
    onboarded: number;
    posted: number;
  };
  /** Last 6 months of RO / Onboarded / Posted for the trend chart. */
  monthlyFunnel: MonthlyPoint[];
  /** Last 30 days of daily stage events for the Overview activity area chart. */
  activity30: ActivityPoint[];
  /** Spend per campaign for the horizontal bar list (top 8). */
  spendsPerCampaign: RankedRow[];
  /** Goal-driven progress: % of onboarded that have shipped a post. */
  postingGoal: {
    target: number;
    achieved: number;
    pct: number;
  };
  /** Top 6 creators by followers (cached IG metadata). */
  topCreators: Array<{
    username: string;
    name: string | null;
    followers: number | null;
    category: string | null;
    profilePic: string | null;
    postCount: number;
  }>;
  /** Onboardings per team member (logged_by). */
  teamLeaderboard: Array<{ name: string; onboardings: number; posts: number }>;
  /** 4-column mini board — latest 10 cards per stage for managerial scan. */
  stageBoard: {
    reachOut: StageCard[];
    onBoard: StageCard[];
    posted: StageCard[];
    paid: StageCard[];
  };
  /**
   * TRUE total count per stage bucket (the full count, not the 10-card preview).
   * Drives the column-header badge so it shows e.g. 14 even though only 10 cards
   * render. `stageBoard` arrays are capped at 10 for the preview.
   */
  stageCounts: {
    reachOut: number;
    onBoard: number;
    posted: number;
    paid: number;
  };
}

export interface StageCard {
  postId: string;
  /** Collab ID grouping this deliverable — shown as a small muted secondary under postId. */
  collabId: string | null;
  username: string;
  name: string | null;
  profilePic: string | null;
  campaign: string | null;
  date: string | null;
  amount: number | null;
  /** Who handled this stage — onboarded_by for OB+ stages, logged_by for Reach Out. */
  assignee: string | null;
  /** Tooltip text shown over the assignee roundel ("Onboarded by …" / "Reached out by …"). */
  assigneeLabel: string;
  /** Days waiting in this stage (since the last stage transition). */
  daysStuck: number;
  /** Human-readable sub-status: "not yet onboarded" / "not yet posted" / etc. */
  stuckLabel: string;
}

export const ACTION_HREFS: Record<keyof ActionCounts, string> = {
  needsEmail: "/onboarding?missingEmail=1",
  needsOrder: "/onboarding?missingOrder=1",
  awaitingPost: "/posting?stage=On+Board",
  noTracking: "/order-status?status=transit",
  noPartnership: "/posting?missingPartnership=1",
  overdue: "/order-status?status=pending",
};
