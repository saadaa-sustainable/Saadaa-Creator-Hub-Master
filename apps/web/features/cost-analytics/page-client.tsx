"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Calendar,
  Filter,
  IndianRupee,
  Layers,
  RefreshCw,
  Shirt,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { VersionChip, VersionExplainer } from "@/features/budget/version-chip";
import { formatRupees } from "@/lib/formatters";
import { HeroKpi, InfoDot } from "@/features/dashboard/bento-kit";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type {
  CampaignTotalsRow,
  CostAnalyticsData,
  CostBreakdownRow,
  CostKpis,
  MonthSummaryRow,
  Tier,
  TierSummaryRow,
} from "./types";

const TIERS: Tier[] = ["Nano", "Micro", "Mid tier", "Macro", "Mega", "Unknown"];
const COLLAB_TYPES = ["Barter", "Paid"] as const;
const TIER_COLOR: Record<Tier, string> = {
  Nano: "#3B6FD4",
  Micro: "#06B6D4",
  "Mid tier": "#E8A020",
  Macro: "#7B4FBF",
  Mega: "#B54F7A",
  Unknown: "#9A9384",
};

export function CostAnalyticsBody({ data }: { data: CostAnalyticsData }) {
  const router = useRouter();
  const [month, setMonth] = useState<string>("");
  const [tier, setTier] = useState<string>("");
  const [collabType, setCollabType] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredRows = useMemo(
    () =>
      data.rows.filter((row) => {
        if (month && row.month !== month) return false;
        if (tier && row.tier !== tier) return false;
        if (
          collabType &&
          !row.collabType.toLowerCase().includes(collabType.toLowerCase())
        ) {
          return false;
        }
        if (normalizedQuery) {
          const hay = `${row.campaignId} ${row.campaignName}`.toLowerCase();
          if (!hay.includes(normalizedQuery)) return false;
        }
        return true;
      }),
    [data.rows, month, tier, collabType, normalizedQuery],
  );

  // Filter campaign totals by query/collab for KPI rollup. Tier/month only
  // affect per-row tables since campaign totals aren't sliced by tier.
  const filteredCampaignTotals = useMemo(() => {
    return data.campaignTotals.filter((c) => {
      if (normalizedQuery) {
        const hay = `${c.campaignId} ${c.campaignName}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [data.campaignTotals, normalizedQuery]);

  const filteredKpis = useMemo<CostKpis>(() => {
    if (!month && !tier && !collabType && !normalizedQuery) return data.kpis;
    const acc: CostKpis = {
      budgetCreators: 0,
      actualCreators: 0,
      budgetCost: 0,
      actualCost: 0,
      totalWithGarments: 0,
      variance: 0,
      utilPct: 0,
    };
    // Sum from filtered rows for actuals.
    for (const r of filteredRows) {
      acc.actualCreators += r.actualCreators;
      acc.actualCost += r.actualCost;
      acc.totalWithGarments += r.totalWithGarments;
    }
    // Budget — sum campaigns.total_budget for campaigns matching query.
    for (const c of filteredCampaignTotals) {
      acc.budgetCreators += c.budgetCreators;
      acc.budgetCost += c.budgetCost;
    }
    acc.variance = acc.actualCost - acc.budgetCost;
    acc.utilPct =
      acc.budgetCost > 0
        ? Math.round((acc.actualCost / acc.budgetCost) * 100)
        : 0;
    return acc;
  }, [
    data.kpis,
    filteredRows,
    filteredCampaignTotals,
    month,
    tier,
    collabType,
    normalizedQuery,
  ]);

  const filteredMonthSummary = useMemo(
    () =>
      month
        ? data.monthSummary.filter((m) => m.month === month)
        : data.monthSummary,
    [data.monthSummary, month],
  );

  const filteredTierSummary = useMemo<TierSummaryRow[]>(() => {
    const map = new Map<Tier, TierSummaryRow>();
    for (const r of filteredRows) {
      const existing = map.get(r.tier) ?? {
        tier: r.tier,
        budgetCreators: 0,
        actualCreators: 0,
        budgetCost: 0,
        actualCost: 0,
        totalWithGarments: 0,
        variance: 0,
        utilPct: 0,
      };
      existing.budgetCreators += r.budgetCreators;
      existing.actualCreators += r.actualCreators;
      existing.budgetCost += r.budgetCost;
      existing.actualCost += r.actualCost;
      existing.totalWithGarments += r.totalWithGarments;
      map.set(r.tier, existing);
    }
    return TIERS.map((t) => {
      const row = map.get(t) ?? {
        tier: t,
        budgetCreators: 0,
        actualCreators: 0,
        budgetCost: 0,
        actualCost: 0,
        totalWithGarments: 0,
        variance: 0,
        utilPct: 0,
      };
      row.variance = row.actualCost - row.budgetCost;
      row.utilPct =
        row.budgetCost > 0
          ? Math.round((row.actualCost / row.budgetCost) * 100)
          : 0;
      return row;
    }).filter(
      (row) =>
        row.budgetCreators > 0 || row.actualCreators > 0 || row.budgetCost > 0,
    );
  }, [filteredRows]);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden sm:gap-4">
      <FilterRow
        month={month}
        tier={tier}
        collabType={collabType}
        query={query}
        months={data.months}
        onMonthChange={setMonth}
        onTierChange={setTier}
        onCollabTypeChange={setCollabType}
        onQueryChange={setQuery}
        onRefresh={() => {
          setRefreshing(true);
          router.refresh();
          setTimeout(() => setRefreshing(false), 600);
        }}
        refreshing={refreshing}
      />

      <KpiStrip kpis={filteredKpis} />

      {/* ── Bento mosaic — desktop 12-col, mobile 1-col ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bento-stagger">
        <div className="lg:col-span-8 min-w-0">
          <BudgetVsActualChart rows={filteredCampaignTotals} />
        </div>
        <div className="lg:col-span-4 min-w-0">
          <TierMixDonut rows={filteredTierSummary} />
        </div>
        <div className="lg:col-span-6 min-w-0">
          <AlertsCard
            overBudget={data.alerts.overBudget}
            underUtilised={data.alerts.underUtilised}
          />
        </div>
        <div className="lg:col-span-6 min-w-0">
          <GarmentSpendCard kpis={filteredKpis} />
        </div>
        <div className="lg:col-span-12 min-w-0">
          <CampaignTotalsTable rows={filteredCampaignTotals} />
        </div>
        <div className="lg:col-span-12 min-w-0">
          <MonthSummary rows={filteredMonthSummary} />
        </div>
        <div className="lg:col-span-12 min-w-0">
          <CampaignBreakdown rows={filteredRows} />
        </div>
        <div className="lg:col-span-12 min-w-0">
          <TierBreakdown rows={filteredTierSummary} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter row — shared shell
// ─────────────────────────────────────────────────────────────────────────────

function FilterRow({
  month,
  tier,
  collabType,
  query,
  months,
  onMonthChange,
  onTierChange,
  onCollabTypeChange,
  onQueryChange,
  onRefresh,
  refreshing,
}: {
  month: string;
  tier: string;
  collabType: string;
  query: string;
  months: string[];
  onMonthChange: (v: string) => void;
  onTierChange: (v: string) => void;
  onCollabTypeChange: (v: string) => void;
  onQueryChange: (v: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="onboarding-filter-card">
      <div className="onboarding-filter-grid">
        <label className="onboarding-filter-field acc-filter-search">
          <span>
            <Filter size={10} aria-hidden /> Search
          </span>
          <input
            type="text"
            value={query}
            placeholder="Campaign name or ID…"
            onChange={(e) => onQueryChange(e.target.value)}
            className="onboarding-filter-select"
          />
        </label>
        <label className="onboarding-filter-field">
          <span>
            <Calendar size={10} aria-hidden /> Month
          </span>
          <SearchableSelect
            value={month}
            onChange={onMonthChange}
            options={[
              { value: "", label: "All months" },
              ...months.map((m) => ({ value: m, label: m })),
            ]}
            placeholder="All months"
            searchPlaceholder="Search months…"
          />
        </label>
        <label className="onboarding-filter-field">
          <span>
            <Layers size={10} aria-hidden /> Tier
          </span>
          <SearchableSelect
            value={tier}
            onChange={onTierChange}
            options={[
              { value: "", label: "All tiers" },
              ...TIERS.map((t) => ({ value: t, label: t })),
            ]}
            placeholder="All tiers"
            searchPlaceholder="Search tiers…"
          />
        </label>
        <label className="onboarding-filter-field">
          <span>
            <Wallet size={10} aria-hidden /> Collab
          </span>
          <SearchableSelect
            value={collabType}
            onChange={onCollabTypeChange}
            options={[
              { value: "", label: "All types" },
              ...COLLAB_TYPES.map((c) => ({ value: c, label: c })),
            ]}
            placeholder="All types"
            searchPlaceholder="Search types…"
          />
        </label>
        <div className="onboarding-filter-actions">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-full text-[0.72rem] font-extrabold bg-[--accent] text-text-primary border border-[--accent] transition-all",
              refreshing
                ? "opacity-70 cursor-wait"
                : "hover:scale-[1.03] hover:shadow-md active:scale-[0.97]",
            )}
          >
            <RefreshCw
              size={12}
              aria-hidden
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Strip — 5 bento-kit HeroKpi tiles (DAM-style: accent bar, tinted corner,
// count-up). Same labels/values/subs as the old .acc-kpi tiles; semantic
// colors — volume indigo, budget series purple, in-flight spend amber,
// healthy remaining green, risk red.
// ─────────────────────────────────────────────────────────────────────────────

function KpiStrip({ kpis }: { kpis: CostKpis }) {
  const overBudget = kpis.variance > 0;
  const variancePct =
    kpis.budgetCost > 0
      ? Math.round((Math.abs(kpis.variance) / kpis.budgetCost) * 100)
      : 0;
  const remaining = kpis.budgetCost - kpis.actualCost;
  return (
    <div className="acc-kpi-grid bento-stagger max-[480px]:grid-cols-2!">
      <HeroKpi
        color="#3B6FD4"
        icon={<Users size={16} aria-hidden />}
        label="Budget Creators"
        value={kpis.budgetCreators}
        sub={`${kpis.actualCreators} actual onboarded`}
        info="Planned creator count across campaign budgets in scope"
      />
      <HeroKpi
        color="#7B4FBF"
        icon={<Wallet size={16} aria-hidden />}
        label="Actual (First Budget)"
        rupees
        value={kpis.budgetCost}
        sub="The V0 budget the campaign was created with"
        info="The first created budget (V0) of each campaign in scope — this is the sanctioned money"
      />
      <HeroKpi
        color="#B57514"
        icon={<IndianRupee size={16} aria-hidden />}
        label="Expected"
        rupees
        value={kpis.actualCost}
        sub={`${kpis.utilPct}% of the budget used`}
        info="What onboarded collabs commit us to spend: commercial + order value (Barter + Paid) or order value only (Barter)"
      />
      <HeroKpi
        color={remaining >= 0 ? "#4F7C4D" : "#C0392B"}
        icon={<Target size={16} aria-hidden />}
        label="Budget Left"
        rupees
        value={Math.max(0, remaining)}
        sub={
          remaining >= 0
            ? `${Math.max(0, 100 - kpis.utilPct)}% still available`
            : `Over by ${formatRupees(Math.abs(remaining))}`
        }
        info="First budget minus expected — what's still available to spend"
      />
      <HeroKpi
        color={overBudget ? "#C0392B" : "#4F7C4D"}
        icon={
          overBudget ? (
            <TrendingUp size={16} aria-hidden />
          ) : (
            <TrendingDown size={16} aria-hidden />
          )
        }
        label={overBudget ? "Over Budget By" : "Within Budget"}
        rupees
        value={Math.abs(kpis.variance)}
        sub={
          kpis.variance === 0
            ? "Exactly on budget"
            : overBudget
              ? `${variancePct}% more than planned`
              : `${variancePct}% below the plan`
        }
        info="How far expected spend is from the first budget — plain difference, no jargon"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bento widgets
// ─────────────────────────────────────────────────────────────────────────────

function BudgetVsActualChart({ rows }: { rows: CampaignTotalsRow[] }) {
  if (rows.length === 0) {
    return (
      <Card title="First Budget vs Expected" icon={Banknote}>
        <Empty msg="No campaign data yet." />
      </Card>
    );
  }
  const max = Math.max(
    1,
    ...rows.map((r) => Math.max(r.budgetCost, r.actualCost)),
  );
  return (
    <Card
      title="First Budget vs Expected"
      icon={Banknote}
      subtitle="Side-by-side per campaign"
    >
      <ul className="flex flex-col gap-2.5">
        {rows.slice(0, 8).map((r) => {
          const budgetPct = (r.budgetCost / max) * 100;
          const actualPct = (r.actualCost / max) * 100;
          const over = r.variance > 0;
          return (
            <li
              key={r.campaignId}
              className="flex flex-col gap-1 text-[0.7rem]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex items-baseline gap-1.5">
                  <span className="font-extrabold text-text-primary truncate">
                    {r.campaignName}
                  </span>
                  <span className="text-[0.55rem] uppercase tracking-[0.05em] text-text-tertiary font-bold tabular">
                    {r.campaignId}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-[0.62rem] font-extrabold tabular",
                    over ? "text-danger" : "text-success",
                  )}
                >
                  {r.variance === 0
                    ? "—"
                    : `${over ? "+" : "−"}${formatRupees(Math.abs(r.variance))}`}
                </span>
              </div>
              <div className="space-y-1">
                <div
                  className="h-2 rounded-full bg-[#E8EEFB] overflow-hidden"
                  title={`First budget (V0): ${formatRupees(r.budgetCost)}`}
                >
                  <div
                    className="bento-bar h-full bg-[#3B6FD4] transition-all duration-500"
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <div
                  className={cn(
                    "h-2 rounded-full overflow-hidden",
                    over ? "bg-danger-bg" : "bg-success-bg",
                  )}
                  title={`Expected: ${formatRupees(r.actualCost)}`}
                >
                  <div
                    className={cn(
                      "bento-bar h-full transition-all duration-500",
                      over ? "bg-danger" : "bg-success",
                    )}
                    style={{ width: `${actualPct}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 text-[0.55rem] uppercase tracking-[0.05em] font-extrabold text-text-tertiary mt-1">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#3B6FD4]" />
          First Budget
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-success" />
          Expected (within)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-danger" />
          Expected (over)
        </span>
      </div>
    </Card>
  );
}

function TierMixDonut({ rows }: { rows: TierSummaryRow[] }) {
  const total = rows.reduce((acc, r) => acc + r.actualCost, 0);
  if (total === 0) {
    return (
      <Card title="Tier Mix" icon={Layers}>
        <Empty msg="No actual spend yet." />
      </Card>
    );
  }
  const sorted = [...rows].sort((a, b) => b.actualCost - a.actualCost);
  return (
    <Card title="Tier Mix" icon={Layers} subtitle="Share of actual spend">
      <div className="bento-bar flex h-3 rounded-full overflow-hidden">
        {sorted.map((r) => (
          <div
            key={r.tier}
            style={{
              background: TIER_COLOR[r.tier],
              width: `${(r.actualCost / total) * 100}%`,
            }}
            title={`${r.tier}: ${formatRupees(r.actualCost)}`}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-1 mt-2">
        {sorted.map((r) => {
          const pct = Math.round((r.actualCost / total) * 100);
          return (
            <li
              key={r.tier}
              className="grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-2 text-[0.65rem]"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: TIER_COLOR[r.tier] }}
              />
              <span className="font-bold text-text-secondary truncate">
                {r.tier}
              </span>
              <span className="text-text-tertiary tabular text-[0.58rem]">
                {pct}%
              </span>
              <span className="text-text-primary tabular font-extrabold w-16 text-right">
                {formatRupees(r.actualCost)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AlertsCard({
  overBudget,
  underUtilised,
}: {
  overBudget: CampaignTotalsRow[];
  underUtilised: CampaignTotalsRow[];
}) {
  if (overBudget.length === 0 && underUtilised.length === 0) {
    return (
      <Card title="Alerts" icon={AlertTriangle}>
        <p className="text-[0.7rem] text-success font-bold">
          All campaigns within budget thresholds.
        </p>
      </Card>
    );
  }
  return (
    <Card title="Alerts" icon={AlertTriangle} subtitle="Over budget + money sitting unused">
      <div className="flex flex-col gap-3 text-[0.7rem]">
        {overBudget.length > 0 && (
          <div>
            <div className="text-[0.55rem] uppercase tracking-[0.06em] font-extrabold text-danger mb-1">
              Over budget ({overBudget.length})
            </div>
            <ul className="flex flex-col gap-1">
              {overBudget.map((r) => (
                <li
                  key={r.campaignId}
                  className="flex items-baseline justify-between gap-2 text-[0.7rem]"
                >
                  <span className="font-extrabold text-text-primary truncate">
                    {r.campaignName}{" "}
                    <span className="text-text-tertiary font-bold text-[0.6rem] tabular">
                      {r.campaignId}
                    </span>
                  </span>
                  <span className="text-danger font-extrabold tabular">
                    over by {formatRupees(r.variance)} ({r.utilPct}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {underUtilised.length > 0 && (
          <div>
            <div className="text-[0.55rem] uppercase tracking-[0.06em] font-extrabold text-warning mb-1">
              Money sitting unused ({underUtilised.length})
            </div>
            <ul className="flex flex-col gap-1">
              {underUtilised.map((r) => (
                <li
                  key={r.campaignId}
                  className="flex items-baseline justify-between gap-2 text-[0.7rem]"
                >
                  <span className="font-extrabold text-text-primary truncate">
                    {r.campaignName}{" "}
                    <span className="text-text-tertiary font-bold text-[0.6rem] tabular">
                      {r.campaignId}
                    </span>
                  </span>
                  <span className="text-warning font-extrabold tabular">
                    {r.utilPct}% used
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function GarmentSpendCard({ kpis }: { kpis: CostKpis }) {
  const garmentCost = Math.max(0, kpis.totalWithGarments - kpis.budgetCost);
  const garmentPct =
    kpis.totalWithGarments > 0
      ? Math.round((garmentCost / kpis.totalWithGarments) * 100)
      : 0;
  return (
    <Card
      title="Cost Composition"
      icon={Shirt}
      info="Compensation budget vs garment cost share of total spend"
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[0.55rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
              Compensation
            </div>
            <div className="text-xl sm:text-2xl font-extrabold tabular text-success">
              {formatRupees(kpis.budgetCost)}
            </div>
          </div>
          <div>
            <div className="text-[0.55rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary">
              Garment Cost
            </div>
            <div className="text-xl sm:text-2xl font-extrabold tabular text-warning">
              {formatRupees(garmentCost)}
            </div>
          </div>
        </div>
        <div className="bento-bar flex h-3 rounded-full overflow-hidden">
          <div
            className="bg-success"
            style={{
              width: `${
                kpis.totalWithGarments > 0
                  ? (kpis.budgetCost / kpis.totalWithGarments) * 100
                  : 100
              }%`,
            }}
            title={`Compensation: ${formatRupees(kpis.budgetCost)}`}
          />
          <div
            className="bg-warning"
            style={{ width: `${garmentPct}%` }}
            title={`Garments: ${formatRupees(garmentCost)}`}
          />
        </div>
        <p className="text-[0.6rem] text-text-tertiary">
          Total with garments: {formatRupees(kpis.totalWithGarments)} ·{" "}
          {garmentPct}% garment share
        </p>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

function CampaignTotalsTable({ rows }: { rows: CampaignTotalsRow[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Campaign Totals" icon={Target}>
        <Empty msg="No campaigns in scope." />
      </Card>
    );
  }
  return (
    <Card
      title="Campaign Totals"
      icon={Target}
      subtitle={`${rows.length} campaigns · click ▸ for the version split (V0 / V1 / V2…)`}
    >
      <VersionExplainer compact />
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 mt-2">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[720px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="pb-2 w-6" aria-label="Expand" />
              <th className="text-left pb-2 pr-3">Campaign Name</th>
              <th className="text-left pb-2 px-1.5">Campaign ID</th>
              <th className="text-center pb-2 px-1.5">Planned C</th>
              <th className="text-center pb-2 px-1.5">Onboarded C</th>
              <th className="text-right pb-2 px-1.5">Actual (First Budget) ₹</th>
              <th className="text-right pb-2 px-1.5">Expected ₹</th>
              <th className="text-right pb-2 px-1.5">Budget Left</th>
              <th className="text-center pb-2 pl-1.5">% Used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <CampaignTotalsRowItem key={r.campaignId} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const VERSION_KIND_TEXT: Record<string, string> = {
  initial: "First created budget",
  carry_forward: "Carry-forward",
  top_up: "Top-up (new money)",
};

function CampaignTotalsRowItem({ r }: { r: CampaignTotalsRow }) {
  const [open, setOpen] = useState(false);
  const versions = r.versions ?? [];
  const expandable = versions.length > 0;
  return (
    <>
      <tr className="border-t border-border hover:bg-bg-muted/40 transition-colors">
        <td className="py-1.5">
          {expandable && (
            <button
              type="button"
              className="text-text-tertiary hover:text-text-primary"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Hide versions" : "Show versions"}
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
        </td>
        <td className="py-1.5 pr-3 font-extrabold text-text-primary truncate max-w-[180px]">
          {r.campaignName}
        </td>
        <td className="py-1.5 px-1.5 font-bold text-text-secondary tabular">
          {r.campaignId}
        </td>
        <td className="py-1.5 px-1.5 text-center tabular text-text-secondary">
          {r.budgetCreators || "—"}
        </td>
        <td className="py-1.5 px-1.5 text-center tabular text-text-primary font-bold">
          {r.actualCreators || "—"}
        </td>
        <td className="py-1.5 px-1.5 text-right tabular text-text-secondary">
          {r.budgetCost > 0 ? formatRupees(r.budgetCost) : "—"}
        </td>
        <td className="py-1.5 px-1.5 text-right tabular text-text-primary font-bold">
          {r.actualCost > 0 ? formatRupees(r.actualCost) : "—"}
        </td>
        <VarianceCell value={r.variance} />
        <UtilCell pct={r.utilPct} />
      </tr>
      {open && expandable && (
        <tr className="border-t border-border bg-bg-muted/30">
          <td />
          <td colSpan={8} className="py-2 pr-3">
            <table className="w-full text-[0.64rem] sm:text-[0.7rem] min-w-[560px]">
              <thead>
                <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] font-extrabold">
                  <th className="text-left pb-1 pr-2">Version</th>
                  <th className="text-left pb-1 px-1.5">What it is</th>
                  <th className="text-left pb-1 px-1.5">Month</th>
                  <th className="text-right pb-1 px-1.5">Amount</th>
                  <th className="text-right pb-1 px-1.5">Expected against it</th>
                  <th className="text-right pb-1 pl-1.5">Left</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr
                    key={v.versionNumber}
                    className="border-t border-border/60"
                  >
                    <td className="py-1 pr-2">
                      <VersionChip n={v.versionNumber} kind={v.kind} />
                    </td>
                    <td className="py-1 px-1.5 text-text-secondary">
                      {VERSION_KIND_TEXT[v.kind] ?? v.kind}
                      {v.gapReason && (
                        <span
                          className="block text-[0.6rem] text-warning truncate max-w-[240px]"
                          title={v.gapReason}
                        >
                          Why unused: {v.gapReason}
                        </span>
                      )}
                    </td>
                    <td className="py-1 px-1.5 tabular">{v.month}</td>
                    <td className="py-1 px-1.5 text-right tabular font-bold">
                      {formatRupees(v.amount)}
                    </td>
                    <td className="py-1 px-1.5 text-right tabular">
                      {v.expectedAgainst == null
                        ? v.status === "pending_approval"
                          ? "pending approval"
                          : "—"
                        : formatRupees(v.expectedAgainst)}
                    </td>
                    <td className="py-1 pl-1.5 text-right tabular text-text-secondary">
                      {v.remaining == null ? "—" : formatRupees(v.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function MonthSummary({ rows }: { rows: MonthSummaryRow[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Month Summary" icon={Calendar}>
        <Empty msg="No budget data in selected range." />
      </Card>
    );
  }
  return (
    <Card
      title="Month Summary"
      icon={Calendar}
      subtitle={`${rows.length} months`}
    >
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[640px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-left pb-2 pr-3">Month</th>
              <th className="text-center pb-2 px-1.5">Planned C</th>
              <th className="text-center pb-2 px-1.5">Onboarded C</th>
              <th className="text-right pb-2 px-1.5">Actual (First Budget) ₹</th>
              <th className="text-right pb-2 px-1.5">Expected ₹</th>
              <th className="text-right pb-2 px-1.5">Budget Left</th>
              <th className="text-center pb-2 pl-1.5">% Used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.month}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 pr-3 font-extrabold text-text-primary truncate">
                  {r.month}
                </td>
                <td className="py-1.5 px-1.5 text-center tabular text-text-secondary">
                  {r.budgetCreators}
                </td>
                <td className="py-1.5 px-1.5 text-center tabular text-text-primary font-bold">
                  {r.actualCreators}
                </td>
                <td className="py-1.5 px-1.5 text-right tabular text-text-secondary">
                  {formatRupees(r.budgetCost)}
                </td>
                <td className="py-1.5 px-1.5 text-right tabular text-text-primary font-bold">
                  {formatRupees(r.actualCost)}
                </td>
                <VarianceCell value={r.variance} />
                <UtilCell pct={r.utilPct} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CampaignBreakdown({ rows }: { rows: CostBreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Campaign Breakdown (per tier)" icon={Sparkles}>
        <Empty msg="No rows match the current filters." />
      </Card>
    );
  }
  return (
    <Card
      title="Campaign Breakdown (per tier)"
      icon={Sparkles}
      subtitle={`${rows.length} rows · grouped by month · campaign · tier`}
    >
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[860px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-left pb-2 pr-3">Month</th>
              <th className="text-left pb-2 px-1.5">Campaign Name</th>
              <th className="text-left pb-2 px-1.5">Campaign ID</th>
              <th className="text-center pb-2 px-1.5">Tier</th>
              <th className="text-center pb-2 px-1.5">Collab</th>
              <th className="text-center pb-2 px-1.5">Planned C</th>
              <th className="text-center pb-2 px-1.5">Onboarded C</th>
              <th className="text-right pb-2 px-1.5">Actual (First Budget) ₹</th>
              <th className="text-right pb-2 px-1.5">Expected ₹</th>
              <th className="text-right pb-2 pl-1.5">Budget Left</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.month}-${r.campaignId}-${r.tier}`}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 pr-3 font-bold text-text-secondary truncate">
                  {r.month}
                </td>
                <td className="py-1.5 px-1.5 font-extrabold text-text-primary truncate max-w-[160px]">
                  {r.campaignName}
                </td>
                <td className="py-1.5 px-1.5 font-bold text-text-secondary tabular">
                  {r.campaignId}
                </td>
                <td className="py-1.5 px-1.5 text-center text-[0.62rem]">
                  <TierPill tier={r.tier} />
                </td>
                <td className="py-1.5 px-1.5 text-center text-text-secondary text-[0.62rem]">
                  {r.collabType || "—"}
                </td>
                <td className="py-1.5 px-1.5 text-center tabular text-text-secondary">
                  {r.budgetCreators || "—"}
                </td>
                <td className="py-1.5 px-1.5 text-center tabular text-text-primary font-bold">
                  {r.actualCreators || "—"}
                </td>
                <td className="py-1.5 px-1.5 text-right tabular text-text-secondary">
                  {r.budgetCost > 0 ? formatRupees(r.budgetCost) : "—"}
                </td>
                <td className="py-1.5 px-1.5 text-right tabular text-text-primary font-bold">
                  {r.actualCost > 0 ? formatRupees(r.actualCost) : "—"}
                </td>
                <VarianceCell value={r.variance} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TierBreakdown({ rows }: { rows: TierSummaryRow[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Tier Breakdown" icon={Layers}>
        <Empty msg="No tier data yet." />
      </Card>
    );
  }
  return (
    <Card
      title="Tier Breakdown"
      icon={Layers}
      subtitle={`${rows.length} active tiers`}
    >
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[560px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-left pb-2 pr-3">Tier</th>
              <th className="text-center pb-2 px-1.5">Planned C</th>
              <th className="text-center pb-2 px-1.5">Onboarded C</th>
              <th className="text-right pb-2 px-1.5">Actual (First Budget) ₹</th>
              <th className="text-right pb-2 px-1.5">Expected ₹</th>
              <th className="text-right pb-2 px-1.5">Budget Left</th>
              <th className="text-center pb-2 pl-1.5">% Used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.tier}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 pr-3">
                  <TierPill tier={r.tier} />
                </td>
                <td className="py-1.5 px-1.5 text-center tabular text-text-secondary">
                  {r.budgetCreators}
                </td>
                <td className="py-1.5 px-1.5 text-center tabular text-text-primary font-bold">
                  {r.actualCreators}
                </td>
                <td className="py-1.5 px-1.5 text-right tabular text-text-secondary">
                  {formatRupees(r.budgetCost)}
                </td>
                <td className="py-1.5 px-1.5 text-right tabular text-text-primary font-bold">
                  {formatRupees(r.actualCost)}
                </td>
                <VarianceCell value={r.variance} />
                <UtilCell pct={r.utilPct} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  icon: Icon,
  info,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  info?: string;
  children: React.ReactNode;
}) {
  const definitions: Record<string, string> = {
    "Budget vs Actual":
      "Compares the approved campaign budget with recorded creator commercial spend. Longer actual bars than budget bars indicate overspend.",
    "Tier Mix":
      "Shows how actual creator spend is distributed across follower tiers. Percentages are each tier's share of total actual spend.",
    Alerts:
      "Campaigns appear here when actual spend is over budget or when too little of the approved budget has been used.",
    "Cost Composition":
      "Splits the total cost into creator compensation and garment cost so the real campaign outlay is visible.",
    "Campaign Totals":
      "One row per campaign. Budget values come from campaign planning; actual values come from recorded creator commercials. Variance is actual minus budget.",
    "Month Summary":
      "Groups budgeted and actual creator counts and spend by month. Utilised is actual spend divided by budgeted spend.",
    "Campaign Breakdown (per tier)":
      "A detailed campaign and creator-tier view. Each row compares planned creator count and spend with actual results for that tier.",
    "Tier Breakdown":
      "Combines all campaigns by creator tier and compares planned versus actual creator counts and spend.",
  };
  const resolvedInfo =
    info ??
    definitions[title] ??
    `${title} uses the records matching the filters currently applied to Cost Analytics.`;
  return (
    <section className="bento-tile h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3 min-w-0">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          {Icon && <Icon size={12} aria-hidden />} {title}
          <InfoDot text={resolvedInfo} title={title} />
        </h3>
        {subtitle && (
          <span className="text-[0.6rem] text-text-tertiary">{subtitle}</span>
        )}
      </header>
      {children}
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-[0.7rem] text-text-tertiary">{msg}</p>;
}

/**
 * "Budget Left" cell — `value` is the internal variance (expected − budget),
 * so what's LEFT is its negation. Green = money still available; red = the
 * campaign is over its budget by that amount.
 */
function VarianceCell({ value }: { value: number }) {
  if (value === 0) {
    return (
      <td className="py-1.5 px-1.5 text-right tabular text-text-tertiary">—</td>
    );
  }
  const over = value > 0;
  return (
    <td
      className={cn(
        "py-1.5 px-1.5 text-right tabular font-extrabold",
        over ? "text-danger" : "text-success",
      )}
      title={over ? "Over budget by this amount" : "Still available to spend"}
    >
      {over ? "over by " : ""}
      {formatRupees(Math.abs(value))}
    </td>
  );
}

function UtilCell({ pct }: { pct: number }) {
  const tone =
    pct > 100 ? "text-danger" : pct >= 80 ? "text-success" : "text-warning";
  const barTone =
    pct > 100 ? "bg-danger" : pct >= 80 ? "bg-success" : "bg-warning";
  return (
    <td className="py-1.5 pl-1.5 align-middle">
      <div className="flex items-center gap-1.5 justify-end">
        <div className="h-1 w-16 sm:w-20 rounded-full bg-bg-muted overflow-hidden">
          <div
            className={cn(
              "bento-bar h-full transition-all duration-500",
              barTone,
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span className={cn("text-[0.65rem] font-extrabold tabular", tone)}>
          {pct}%
        </span>
      </div>
    </td>
  );
}

function TierPill({ tier }: { tier: Tier }) {
  const tone: Record<Tier, string> = {
    Nano: "bg-[#E8EEFB] text-[#3B6FD4] border-[#3B6FD4]/15",
    Micro: "bg-[#E2F1FA] text-[#06B6D4] border-[#06B6D4]/20",
    "Mid tier": "bg-warning-bg text-warning border-warning/20",
    Macro: "bg-[#F0E5FB] text-[#7B4FBF] border-[#7B4FBF]/15",
    Mega: "bg-[#FBE9F1] text-[#B54F7A] border-[#B54F7A]/15",
    Unknown: "bg-bg-muted text-text-tertiary border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[0.55rem] sm:text-[0.6rem] font-extrabold border whitespace-nowrap",
        tone[tier],
      )}
    >
      {tier}
    </span>
  );
}
