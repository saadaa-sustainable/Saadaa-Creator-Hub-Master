import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import {
  computeExpectedByCampaignMonth,
  fetchAllVersions,
  monthLabel,
} from "@/lib/budget-versions";
import type {
  BudgetMonth,
  BudgetPageData,
  BudgetVersionRow,
  CampaignMonthGroup,
  TierLine,
} from "./types";

/**
 * Budget tab data — every version grouped month → campaign, with the month's
 * money math (allocated / utilized / remaining) computed from the SAME
 * Expected formula Cost Analytics uses (lib/budget-versions.ts).
 */
export async function fetchBudgetPage(): Promise<BudgetPageData> {
  const supabase = createServiceClient();

  const [versions, expected, campaignsRes, linesRes] = await Promise.all([
    fetchAllVersions(supabase),
    computeExpectedByCampaignMonth(supabase),
    (supabase as any)
      .from("campaigns")
      .select("campaign_id, campaign_name")
      .limit(2000),
    (supabase as any)
      .from("campaign_budget")
      .select(
        "id, version_id, tier, collab_type, num_influencers, avg_comp, total_cost, min_garments, max_garments, est_garment_cost, total_with_garments",
      )
      .not("version_id", "is", null)
      .limit(10_000),
  ]);

  const nameById = new Map<string, string>();
  for (const c of ((campaignsRes?.data ?? []) as Array<Record<string, unknown>>)) {
    nameById.set(String(c.campaign_id), String(c.campaign_name ?? ""));
  }

  const linesByVersion = new Map<number, TierLine[]>();
  for (const l of ((linesRes?.data ?? []) as Array<Record<string, unknown>>)) {
    const vid = Number(l.version_id);
    if (!Number.isFinite(vid)) continue;
    const list = linesByVersion.get(vid) ?? [];
    list.push(l as unknown as TierLine);
    linesByVersion.set(vid, list);
  }

  const rows: BudgetVersionRow[] = versions
    // Rejected versions never carried money — they clutter the Budget tab
    // (a campaign whose V0 was rejected showed as a ₹0 group). They stay
    // visible in Approvals history; the Budget tab shows live money only.
    .filter((v) => v.status !== "rejected")
    .map((v) => ({
      ...v,
      amount: Number(v.amount ?? 0),
      campaignName: nameById.get(v.campaign_id) ?? null,
      tierLines: linesByVersion.get(v.id) ?? [],
      draftLines: Array.isArray((v as unknown as { lines?: unknown }).lines)
        ? ((v as unknown as { lines: TierLine[] }).lines)
        : [],
    }));

  // month → campaign → rows
  const byMonth = new Map<string, Map<string, BudgetVersionRow[]>>();
  for (const r of rows) {
    const mk = String(r.month).slice(0, 10);
    let camps = byMonth.get(mk);
    if (!camps) {
      camps = new Map();
      byMonth.set(mk, camps);
    }
    const list = camps.get(r.campaign_id) ?? [];
    list.push(r);
    camps.set(r.campaign_id, list);
  }

  const months: BudgetMonth[] = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
    .map(([key, camps]) => {
      const groups: CampaignMonthGroup[] = [...camps.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([campaignId, list]) => {
          const sorted = [...list].sort(
            (a, b) => a.version_number - b.version_number,
          );
          const allocated = sorted
            .filter((v) => v.status === "approved" || v.status === "closed")
            .reduce((s, v) => s + v.amount, 0);
          const utilized =
            expected.get(campaignId)?.get(key)?.expected ?? 0;
          const pendingAmount = sorted
            .filter((v) => v.status === "pending_approval")
            .reduce((s, v) => s + v.amount, 0);
          return {
            campaignId,
            campaignName: sorted[0]?.campaignName ?? null,
            versions: sorted,
            allocated,
            utilized,
            remaining: Math.max(0, allocated - utilized),
            overBudget: allocated > 0 && utilized > allocated,
            pendingAmount,
          };
        });

      const kpi = groups.reduce(
        (acc, g) => {
          acc.allocated += g.allocated;
          acc.utilized += g.utilized;
          acc.remaining += g.remaining;
          acc.pendingAmount += g.pendingAmount;
          acc.pendingCount += g.versions.filter(
            (v) => v.status === "pending_approval",
          ).length;
          return acc;
        },
        {
          allocated: 0,
          utilized: 0,
          remaining: 0,
          pendingAmount: 0,
          pendingCount: 0,
        },
      );

      return { key, label: monthLabel(key), groups, kpi };
    });

  return { months, defaultMonth: months[0]?.key ?? null };
}
