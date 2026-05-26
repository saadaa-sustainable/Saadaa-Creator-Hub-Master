export interface TatStats {
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface TatData {
  ro_to_onboard: TatStats;
  ro_to_posting: TatStats;
  ro_to_order_created: TatStats;
  ob_to_delivered: TatStats;
  ob_to_posting: TatStats;
  order_to_delivered: TatStats;
  delivered_to_posting: TatStats;
}

export interface CampaignTat {
  campaign: string;
  avgDays: number;
}

export interface TatKpi {
  totalPosts: number;
  postsWithOrder: number;
  avgEndToEnd: number | null;
  delivered: number;
  rto: number;
  cancelled: number;
}

export interface TatFilters {
  campaign?: string;
  tier?: string;
  status?: "posted" | "delivered";
  reachOutFrom?: string; // YYYY-MM-DD
  reachOutTo?: string; // YYYY-MM-DD
}

export interface TatFilterOptions {
  campaigns: { id: string; name: string }[];
  tiers: string[];
}
