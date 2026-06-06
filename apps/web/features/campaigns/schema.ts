import { z } from "zod";
import { isValidUrl } from "@/lib/validators";

/**
 * Campaign Create — exact legacy parity with InfluencerBackend.js#submitCampaign
 * + Index.html#view-campaign markup. 5 form fields, 11-col budget table.
 *
 *   Form fields (legacy IDs in parens):
 *     campaignName    (#camp_name)     — required
 *     keyMessage      (#camp_message)  — required
 *     startDate       (#camp_start_date) — optional campaign start date
 *     endDate         (#camp_end_date) — optional campaign end date
 *     numCreators     (#camp_creators) — optional; sets cap + auto-seeds 2 rows
 *     briefLink       (#camp_brief_link) — required URL
 *     internalBrief   (#camp_internal_brief) — optional URL
 *
 *   Budget row (legacy classes in parens):
 *     tier (.br-tier), collabType (.br-collab), campaignName (.br-segment readonly),
 *     numInfluencers (.br-num), avgComp (.br-avg, locked 0 when Barter),
 *     minGarments fixed 2 (.br-mingar readonly), maxGarments (.br-maxgar, default 3)
 *
 *   Server generates IFC{NNN}; client never sends one.
 */

export const INFLUENCER_TIERS = [
  "Nano (1K to 10K)",
  "Micro (10K to 50K)",
  "Mid tier (50K to 500K)",
  "Macro (500K to 1M)",
  "Mega (1M+)",
] as const;
export type InfluencerTier = (typeof INFLUENCER_TIERS)[number];

export const COLLAB_TYPES = ["Barter", "Paid"] as const;
export type CollabType = (typeof COLLAB_TYPES)[number];

// Tracker formula constants — Budget tab cell I303 = =H*900*0.6
export const GARMENT_UNIT_COST = 900;
export const GARMENT_COST_FACTOR = 0.6;
export const MIN_GARMENTS_FIXED = 2;

export const BudgetRowSchema = z.object({
  tier: z.enum(INFLUENCER_TIERS),
  collabType: z.enum(COLLAB_TYPES),
  campaignName: z.string().trim().default(""),
  numInfluencers: z.coerce.number().int().min(0),
  avgComp: z.coerce.number().min(0),
  minGarments: z.coerce.number().int().min(0).default(MIN_GARMENTS_FIXED),
  maxGarments: z.coerce.number().int().min(1).default(3),
});
export type BudgetRowInput = z.infer<typeof BudgetRowSchema>;
type BudgetRowDraft = Omit<
  BudgetRowInput,
  "numInfluencers" | "avgComp" | "minGarments" | "maxGarments"
> & {
  numInfluencers?: number | string | null;
  avgComp?: number | string | null;
  minGarments?: number | string | null;
  maxGarments?: number | string | null;
};

const urlSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || isValidUrl(v), {
    message: "Must be a valid URL",
  });

export const CampaignCreateSchema = z
  .object({
    campaignName: z.string().trim().min(1, "Campaign Name is required"),
    keyMessage: z.string().trim().min(1, "Key Message is required"),
    startDate: z.string().trim().optional().default(""),
    endDate: z.string().trim().optional().default(""),
    numCreators: z.string().trim().optional().default(""),
    briefLink: urlSchema.refine((v) => v.length > 0, {
      message: "Link to Brief is required",
    }),
    internalBrief: urlSchema.optional().default(""),
    budgetRows: z
      .array(BudgetRowSchema)
      .min(1, "At least one budget line is required"),
  })
  .superRefine((data, ctx) => {
    const allocated = data.budgetRows.reduce(
      (s, r) => s + (r.numInfluencers || 0),
      0,
    );
    if (allocated === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetRows"],
        message: "Set No. of Influencers on at least one budget line",
      });
    }
    const cap = parseInt(data.numCreators, 10);
    if (!isNaN(cap) && cap > 0 && allocated > cap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetRows"],
        message: `Allocated ${allocated} creators but target is ${cap}. Reduce by ${allocated - cap}.`,
      });
    }
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End Date must be on or after Start Date.",
      });
    }
  });

export type CampaignCreateInput = z.infer<typeof CampaignCreateSchema>;

export const CAMPAIGN_DEFAULTS: CampaignCreateInput = {
  campaignName: "",
  keyMessage: "",
  startDate: "",
  endDate: "",
  numCreators: "",
  briefLink: "",
  internalBrief: "",
  // Legacy: rows seeded only when user enters numCreators. Start empty.
  budgetRows: [],
};

/** Computed totals — legacy recalcBudget formulas verbatim. */
function toFiniteNumber(value: number | string | null | undefined): number {
  if (value === "" || value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function computeRowEstGarment(r: BudgetRowDraft): number {
  return (
    toFiniteNumber(r.maxGarments) * GARMENT_UNIT_COST * GARMENT_COST_FACTOR
  ); // I = H × 900 × 0.6
}
export function computeRowCompTotal(r: BudgetRowDraft): number {
  return toFiniteNumber(r.numInfluencers) * toFiniteNumber(r.avgComp); // F = D × E
}
export function computeRowTotal(r: BudgetRowDraft): number {
  return (
    computeRowCompTotal(r) +
    computeRowEstGarment(r) * toFiniteNumber(r.numInfluencers)
  ); // J = F + (I × D)
}
export function computeTotals(rows: BudgetRowDraft[]) {
  return rows.reduce(
    (acc, r) => {
      acc.allocated += toFiniteNumber(r.numInfluencers);
      acc.totalComp += computeRowCompTotal(r);
      acc.totalAll += computeRowTotal(r);
      return acc;
    },
    { allocated: 0, totalComp: 0, totalAll: 0 },
  );
}

export function makeBudgetRow(
  prefill: Partial<BudgetRowInput> = {},
): BudgetRowInput {
  return {
    tier: prefill.tier ?? "Mid tier (50K to 500K)",
    collabType: prefill.collabType ?? "Barter",
    campaignName: prefill.campaignName ?? "",
    numInfluencers: prefill.numInfluencers ?? 0,
    avgComp: prefill.collabType === "Barter" ? 0 : (prefill.avgComp ?? 0),
    minGarments: MIN_GARMENTS_FIXED,
    maxGarments: prefill.maxGarments ?? 3,
  };
}
