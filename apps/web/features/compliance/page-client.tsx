"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Box,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  Filter,
  Instagram,
  Mail,
  Percent,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Timer,
  Truck,
  User2,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ComplianceData, RateBreakdown } from "./types";

/**
 * Layout mirrors legacy `#view-compliance` (Index.html:7478-7533).
 * Five sections: Pipeline Health · Conversion Rates · Avg TAT · Data Coverage
 * · Campaign Breakdown · Onboarded By (Team).
 */
export function ComplianceBody({ data }: { data: ComplianceData }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState("all");
  const [campaign, setCampaign] = useState("");
  const [team, setTeam] = useState("");
  const [query, setQuery] = useState("");

  const campaigns = useMemo(
    () => data.campaigns.map((row) => row.campaign),
    [data.campaigns],
  );
  const teams = useMemo(() => data.team.map((row) => row.user), [data.team]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCampaigns = useMemo(
    () =>
      data.campaigns.filter((row) => {
        const matchesCampaign = !campaign || row.campaign === campaign;
        const matchesQuery =
          !normalizedQuery ||
          row.campaign.toLowerCase().includes(normalizedQuery);
        return matchesCampaign && matchesQuery;
      }),
    [campaign, data.campaigns, normalizedQuery],
  );
  const filteredTeam = useMemo(
    () =>
      data.team.filter((row) => {
        const matchesTeam = !team || row.user === team;
        const matchesQuery =
          !normalizedQuery || row.user.toLowerCase().includes(normalizedQuery);
        return matchesTeam && matchesQuery;
      }),
    [data.team, normalizedQuery, team],
  );
  const show = (key: string) => section === "all" || section === key;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden sm:gap-5">
      <SubHeader
        subtitle="Lifetime pipeline health · conversion rates · TAT · data coverage"
        onRefresh={() => {
          setRefreshing(true);
          router.refresh();
          setTimeout(() => setRefreshing(false), 600);
        }}
        refreshing={refreshing}
      />

      <ComplianceFilters
        section={section}
        campaign={campaign}
        team={team}
        query={query}
        campaigns={campaigns}
        teams={teams}
        onSectionChange={setSection}
        onCampaignChange={setCampaign}
        onTeamChange={setTeam}
        onQueryChange={setQuery}
      />

      {show("pipeline") && (
        <Section title="Pipeline Health" icon={Filter}>
          <Card
            label="Total Creators"
            value={data.pipeline.total}
            hint="All records"
            icon={Users}
            accent="text-text-primary"
          />
          <Card
            label="Reach Out"
            value={data.pipeline.reachOut}
            hint="Contacted"
            icon={Send}
            accent="text-text-secondary"
          />
          <Card
            label="Onboard"
            value={data.pipeline.onBoard}
            hint="Awaiting post"
            icon={User2}
            accent="text-warning"
          />
          <Card
            label="Posted"
            value={data.pipeline.posted}
            hint="Live"
            icon={Instagram}
            accent="text-[#E1306C]"
          />
          <Card
            label="Delivered"
            value={data.pipeline.delivered}
            hint="Garment done"
            icon={Truck}
            accent="text-success"
          />
          <Card
            label="RTO"
            value={data.pipeline.rto}
            hint="Returned"
            icon={ArrowUpRight}
            accent="text-danger"
          />
          <Card
            label="Cancelled"
            value={data.pipeline.cancelled}
            hint=""
            icon={XCircle}
            accent="text-danger"
          />
          <Card
            label="Active"
            value={data.pipeline.active}
            hint="Excl RTO/Cancel"
            icon={Activity}
            accent="text-text-primary"
          />
        </Section>
      )}

      {show("rates") && (
        <Section title="Conversion Rates" icon={Percent}>
          <RateCard
            label="Onboard Rate"
            rate={data.rates.onboardConvRate}
            hint="RO → Onboard"
            icon={BarChart3}
          />
          <RateCard
            label="Posting Rate"
            rate={data.rates.postingRate}
            hint="Active → Posted"
            icon={Camera}
          />
          <RateCard
            label="Delivery Rate"
            rate={data.rates.deliveryRate}
            hint="Posted → Delivered"
            icon={Truck}
          />
          <RateCard
            label="Payment Rate"
            rate={data.rates.paymentRate}
            hint="Posted/Delivered paid"
            icon={Banknote}
          />
          <RateCard
            label="RTO Rate"
            rate={data.rates.rtoRate}
            hint="Of orders placed"
            icon={ArrowUpRight}
            invert
          />
        </Section>
      )}

      {show("tat") && (
        <Section title="Avg Turnaround Times" icon={Timer}>
          <Card
            label="RO → Onboard"
            value={fmtDays(data.tat.roToOb)}
            hint=""
            icon={Timer}
            accent="text-[#3B6FD4]"
          />
          <Card
            label="Onboard → Post"
            value={fmtDays(data.tat.obToPost)}
            hint=""
            icon={CheckCircle2}
            accent="text-warning"
          />
          <Card
            label="RO → Post"
            value={fmtDays(data.tat.roToPost)}
            hint=""
            icon={Clock}
            accent="text-text-primary"
          />
        </Section>
      )}

      {show("coverage") && (
        <Section title="Data Coverage" icon={Database}>
          <CoverageCard
            label="Email Coverage"
            pct={data.coverage.emailCoveragePct}
            primary={data.coverage.withEmail}
            totalLabel={`of ${data.pipeline.total}`}
            icon={Mail}
          />
          <CoverageCard
            label="Bank Coverage"
            pct={data.coverage.bankCoveragePct}
            primary={data.coverage.withBank}
            totalLabel={`of ${data.pipeline.active} active`}
            icon={Banknote}
          />
          <Card
            label="Order Placed"
            value={data.coverage.withOrder}
            hint=""
            icon={Box}
            accent="text-text-primary"
          />
          <Card
            label="Tracking IDs"
            value={data.coverage.withTracking}
            hint=""
            icon={QrCode}
            accent="text-text-primary"
          />
        </Section>
      )}

      {show("breakdown") && <CampaignBreakdown rows={filteredCampaigns} />}
      {show("team") && <TeamCards entries={filteredTeam} />}
    </div>
  );
}

function ComplianceFilters({
  section,
  campaign,
  team,
  query,
  campaigns,
  teams,
  onSectionChange,
  onCampaignChange,
  onTeamChange,
  onQueryChange,
}: {
  section: string;
  campaign: string;
  team: string;
  query: string;
  campaigns: string[];
  teams: string[];
  onSectionChange: (value: string) => void;
  onCampaignChange: (value: string) => void;
  onTeamChange: (value: string) => void;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div className="onboarding-filter-card">
      <div className="onboarding-filter-grid compliance-filter-grid">
        <label className="onboarding-filter-field acc-filter-search">
          <span className="inline-flex items-center gap-1">
            <Search size={12} aria-hidden /> Search
          </span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Campaign or team..."
            className="onboarding-filter-select"
          />
        </label>
        <FilterSelect
          label="View"
          value={section}
          onChange={onSectionChange}
          options={[
            ["all", "All sections"],
            ["pipeline", "Pipeline"],
            ["rates", "Rates"],
            ["tat", "TAT"],
            ["coverage", "Coverage"],
            ["breakdown", "Campaigns"],
            ["team", "Team"],
          ]}
        />
        <FilterSelect
          label="Campaign"
          value={campaign}
          onChange={onCampaignChange}
          options={[
            ["", "All campaigns"],
            ...campaigns.map((name) => [name, name] as [string, string]),
          ]}
        />
        <FilterSelect
          label="Team"
          value={team}
          onChange={onTeamChange}
          options={[
            ["", "All team"],
            ...teams.map((name) => [name, name] as [string, string]),
          ]}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="onboarding-filter-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="onboarding-filter-select"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={`${label}-${optionValue}`} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubHeader({
  subtitle,
  onRefresh,
  refreshing,
}: {
  subtitle: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-3 flex-wrap">
      <span className="text-[0.7rem] sm:text-xs text-text-secondary">
        {subtitle}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border border-[--accent] bg-[--accent] px-2.5 text-[0.66rem] font-extrabold text-text-primary transition-all sm:h-8 sm:px-3 sm:text-[0.72rem]",
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
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 max-w-full flex-col gap-1.5 overflow-hidden sm:gap-3">
      <h2 className="flex items-center gap-1.5 sm:gap-2 text-[0.66rem] sm:text-[0.82rem] font-extrabold text-text-primary uppercase tracking-[0.06em]">
        <span className="inline-flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-bg-surface border border-border text-text-secondary">
          <Icon size={10} aria-hidden className="sm:hidden" />
          <Icon size={12} aria-hidden className="hidden sm:block" />
        </span>
        {title}
      </h2>
      <div className="acc-kpi-grid compliance-kpi-grid">{children}</div>
    </section>
  );
}

function Card({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <article
      className={cn(
        "acc-kpi compliance-metric-card cursor-default",
        metricToneFromAccent(accent),
      )}
    >
      <header className="flex items-center justify-between gap-1.5">
        <span className="text-[0.5rem] sm:text-[0.6rem] uppercase tracking-[0.06em] sm:tracking-[0.08em] font-extrabold text-text-tertiary truncate">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex h-4 w-4 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-bg-muted shrink-0",
            accent,
          )}
        >
          <Icon size={9} aria-hidden className="sm:hidden" />
          <Icon size={11} aria-hidden className="hidden sm:block" />
        </span>
      </header>
      <div
        className={cn(
          "text-base sm:text-[1.7rem] font-extrabold tabular leading-none",
          accent,
        )}
      >
        {value}
      </div>
      {hint && (
        <span className="text-[0.52rem] sm:text-[0.6rem] text-text-tertiary truncate">
          {hint}
        </span>
      )}
    </article>
  );
}

function RateCard({
  label,
  rate,
  hint,
  icon: Icon,
  invert = false,
}: {
  label: string;
  rate: RateBreakdown;
  hint: string;
  icon: LucideIcon;
  invert?: boolean;
}) {
  const tone = invert ? toneRtoRate(rate.pct) : toneRate(rate.pct);
  const toneText = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  const toneBar = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <article
      className={cn(
        "acc-kpi compliance-metric-card cursor-default",
        {
          success: "acc-kpi--success",
          warning: "acc-kpi--warning",
          danger: "acc-kpi--danger",
        }[tone],
      )}
    >
      <header className="flex items-center justify-between gap-1.5">
        <span className="text-[0.5rem] sm:text-[0.6rem] uppercase tracking-[0.06em] sm:tracking-[0.08em] font-extrabold text-text-tertiary truncate">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex h-4 w-4 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-bg-muted shrink-0",
            toneText,
          )}
        >
          <Icon size={9} aria-hidden className="sm:hidden" />
          <Icon size={11} aria-hidden className="hidden sm:block" />
        </span>
      </header>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-base sm:text-[1.7rem] font-extrabold tabular leading-none",
            toneText,
          )}
        >
          {rate.num}
          <span className="text-text-tertiary font-bold mx-0.5 sm:mx-1">/</span>
          {rate.den}
        </span>
      </div>
      <div className="h-1 sm:h-1.5 rounded-full bg-bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all duration-500", toneBar)}
          style={{ width: `${Math.min(100, rate.pct)}%` }}
        />
      </div>
      <span className="text-[0.52rem] sm:text-[0.6rem] text-text-tertiary truncate">
        <strong className={toneText}>{rate.pct}%</strong> · {hint}
      </span>
    </article>
  );
}

function CoverageCard({
  label,
  pct,
  primary,
  totalLabel,
  icon: Icon,
}: {
  label: string;
  pct: number;
  primary: number;
  totalLabel: string;
  icon: LucideIcon;
}) {
  const tone = toneRate(pct);
  const toneText = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  const toneBar = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <article
      className={cn(
        "acc-kpi compliance-metric-card cursor-default",
        {
          success: "acc-kpi--success",
          warning: "acc-kpi--warning",
          danger: "acc-kpi--danger",
        }[tone],
      )}
    >
      <header className="flex items-center justify-between gap-1.5">
        <span className="text-[0.5rem] sm:text-[0.6rem] uppercase tracking-[0.06em] sm:tracking-[0.08em] font-extrabold text-text-tertiary truncate">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex h-4 w-4 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-bg-muted shrink-0",
            toneText,
          )}
        >
          <Icon size={9} aria-hidden className="sm:hidden" />
          <Icon size={11} aria-hidden className="hidden sm:block" />
        </span>
      </header>
      <div
        className={cn(
          "text-base sm:text-[1.7rem] font-extrabold tabular leading-none",
          toneText,
        )}
      >
        {primary}
      </div>
      <div className="h-1 sm:h-1.5 rounded-full bg-bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all duration-500", toneBar)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-[0.52rem] sm:text-[0.6rem] text-text-tertiary truncate">
        <strong className={toneText}>{pct}%</strong> · {totalLabel}
      </span>
    </article>
  );
}

function CampaignBreakdown({ rows }: { rows: ComplianceData["campaigns"] }) {
  if (rows.length === 0) {
    return (
      <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:rounded-2xl sm:p-4">
        <h2 className="text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          Campaign Breakdown
        </h2>
        <p className="mt-2 text-xs text-text-tertiary">No campaign data yet.</p>
      </section>
    );
  }
  return (
    <section className="flex min-w-0 max-w-full flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:gap-3 sm:rounded-2xl sm:p-4">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="flex items-center gap-2 text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-bg-surface border border-border text-text-secondary">
            <ClipboardCheck size={12} aria-hidden />
          </span>
          Campaign Breakdown
        </h2>
        <span className="text-[0.6rem] text-text-tertiary">
          {rows.length} campaigns · sorted A→Z
        </span>
      </header>
      <div className="-mx-2 max-w-[calc(100%+1rem)] overflow-x-auto px-2 sm:mx-0 sm:max-w-full sm:px-0">
        <table className="w-full min-w-[430px] text-[0.62rem] sm:min-w-[520px] sm:text-xs">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.55rem] font-extrabold">
              <th className="text-left pb-2 pr-3">Campaign</th>
              <th className="text-right pb-2 px-1.5">Total</th>
              <th className="text-right pb-2 px-1.5">Posted</th>
              <th className="text-right pb-2 px-1.5">Delivered</th>
              <th className="text-right pb-2 px-1.5">RTO</th>
              <th className="text-right pb-2 pl-1.5">Posting Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone = toneRate(r.postingRate);
              const toneCls = {
                success: "bg-success-bg text-success border-success/20",
                warning: "bg-warning-bg text-warning border-warning/20",
                danger: "bg-danger-bg text-danger border-danger/20",
              }[tone];
              return (
                <tr
                  key={r.campaign}
                  className="border-t border-border hover:bg-bg-muted/40 transition-colors"
                >
                  <td className="py-1.5 pr-3 font-bold text-text-primary truncate">
                    {r.campaign}
                  </td>
                  <td className="py-1.5 px-1.5 text-right tabular">
                    {r.total}
                  </td>
                  <td className="py-1.5 px-1.5 text-right tabular">
                    {r.posted}
                  </td>
                  <td className="py-1.5 px-1.5 text-right tabular">
                    {r.delivered}
                  </td>
                  <td className="py-1.5 px-1.5 text-right tabular">{r.rto}</td>
                  <td className="py-1.5 pl-1.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[0.6rem] font-extrabold border tabular",
                        toneCls,
                      )}
                    >
                      {r.postingRate}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeamCards({ entries }: { entries: ComplianceData["team"] }) {
  if (entries.length === 0) {
    return (
      <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:rounded-2xl sm:p-4">
        <h2 className="text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          Onboarded By (Team)
        </h2>
        <p className="mt-2 text-xs text-text-tertiary">
          No team attribution data yet.
        </p>
      </section>
    );
  }
  return (
    <section className="flex min-w-0 max-w-full flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:gap-3 sm:rounded-2xl sm:p-4">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="flex items-center gap-2 text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-bg-surface border border-border text-text-secondary">
            <Users size={12} aria-hidden />
          </span>
          Onboarded By
        </h2>
        <span className="text-[0.6rem] text-text-tertiary">
          {entries.length} contributors
        </span>
      </header>
      <div className="grid min-w-0 max-w-full grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-6">
        {entries.map((e) => (
          <article
            key={e.user}
            className="rounded-xl border border-border bg-bg-muted/40 p-2 sm:p-2.5 flex flex-col gap-1 min-w-0 transition-all duration-200 hover:shadow-sm hover:bg-bg-muted/60"
          >
            <div className="text-xl sm:text-2xl font-extrabold tabular leading-none text-text-primary">
              {e.count}
            </div>
            <div className="text-[0.6rem] text-text-secondary truncate font-bold">
              {e.user}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function fmtDays(value: number | null): string {
  if (value == null) return "—";
  return `${value}d`;
}

function metricToneFromAccent(accent: string): string {
  if (accent.includes("danger")) return "acc-kpi--danger";
  if (accent.includes("warning")) return "acc-kpi--warning";
  if (accent.includes("success")) return "acc-kpi--success";
  if (accent.includes("3B6FD4")) return "acc-kpi--info";
  if (accent.includes("tertiary") || accent.includes("secondary")) {
    return "acc-kpi--muted";
  }
  return "acc-kpi--accent";
}

function toneRate(value: number): "success" | "warning" | "danger" {
  if (value >= 80) return "success";
  if (value >= 50) return "warning";
  return "danger";
}

function toneRtoRate(value: number): "success" | "warning" | "danger" {
  return value > 20 ? "danger" : "success";
}
