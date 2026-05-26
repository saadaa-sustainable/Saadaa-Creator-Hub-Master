/**
 * Compliance KPIs — mirrors legacy `getComplianceKPIs` schema 1:1
 * (legacy-gas/InfluencerBackend.js:8780-8958).
 *
 * Lifetime aggregates (no date filtering — legacy parity).
 */

export interface PipelineCounts {
  total: number;
  reachOut: number;
  onBoard: number;
  posted: number;
  delivered: number;
  rto: number;
  cancelled: number;
  active: number; // total - rto - cancelled
}

export interface RateBreakdown {
  pct: number; // %
  num: number; // numerator
  den: number; // denominator
}

export interface ConversionRates {
  onboardConvRate: RateBreakdown; // (onBoard+posted+delivered) / total
  postingRate: RateBreakdown; // (posted+delivered) / active
  deliveryRate: RateBreakdown; // delivered / (posted+delivered)
  paymentRate: RateBreakdown; // paid / (posted+delivered)
  rtoRate: RateBreakdown; // rto / withOrder
}

export interface TurnaroundAverages {
  roToOb: number | null; // avg days reach_out_date → onboard_date
  obToPost: number | null; // avg days onboard_date → post_date
  roToPost: number | null; // avg days reach_out_date → post_date
}

export interface CoverageCounts {
  withOrder: number; // posts with order_id
  withTracking: number; // posts with tracking_id
  withPostLink: number; // posts with post_link
  withEmail: number; // posts with email
  withBank: number; // posts with bank_number
  emailCoveragePct: number; // withEmail / total · %
  bankCoveragePct: number; // withBank / active · %
}

export interface CampaignBreakdownRow {
  campaign: string;
  total: number;
  posted: number; // posted + delivered combined
  delivered: number;
  rto: number;
  postingRate: number; // %
}

export interface TeamBreakdownRow {
  user: string;
  count: number;
}

export interface ComplianceData {
  pipeline: PipelineCounts;
  rates: ConversionRates;
  tat: TurnaroundAverages;
  coverage: CoverageCounts;
  campaigns: CampaignBreakdownRow[];
  team: TeamBreakdownRow[];
}
