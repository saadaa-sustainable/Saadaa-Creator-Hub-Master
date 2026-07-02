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
import { CountUp } from "@/components/ui/count-up";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { HeroKpi, InfoDot } from "@/features/dashboard/bento-kit";
import type { ComplianceData, RateBreakdown } from "./types";

/**
 * Layout mirrors legacy `#view-compliance` (Index.html:7478-7533).
 * Five sections: Pipeline Health · Conversion Rates · Avg TAT · Data Coverage
 * · Campaign Breakdown · Onboarded By (Team).
 *
 * Visual layer: bento-kit `HeroKpi` tiles for counts, a matching local
 * `PctTile` (same DNA + `.bento-bar` progress) for percent metrics. All
 * values/labels come straight from `ComplianceData` — presentation only.
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
          <HeroKpi
            color="#3B6FD4"
            icon={<Users size={14} aria-hidden />}
            label="Total Creators"
            value={data.pipeline.total}
            sub="All records"
          />
          <HeroKpi
            color="#3B6FD4"
            icon={<Send size={14} aria-hidden />}
            label="Reach Out"
            value={data.pipeline.reachOut}
            sub="Contacted"
          />
          <HeroKpi
            color="#B57514"
            icon={<User2 size={14} aria-hidden />}
            label="Onboard"
            value={data.pipeline.onBoard}
            sub="Awaiting post"
          />
          <HeroKpi
            color="#7B4FBF"
            icon={<Instagram size={14} aria-hidden />}
            label="Posted"
            value={data.pipeline.posted}
            sub="Live"
          />
          <HeroKpi
            color="#4F7C4D"
            icon={<Truck size={14} aria-hidden />}
            label="Delivered"
            value={data.pipeline.delivered}
            sub="Garment done"
          />
          <HeroKpi
            color="#C0392B"
            icon={<ArrowUpRight size={14} aria-hidden />}
            label="RTO"
            value={data.pipeline.rto}
            sub="Returned"
          />
          <HeroKpi
            color="#C0392B"
            icon={<XCircle size={14} aria-hidden />}
            label="Cancelled"
            value={data.pipeline.cancelled}
            sub=""
            info="Collabs marked cancelled"
          />
          <HeroKpi
            color="#3B6FD4"
            icon={<Activity size={14} aria-hidden />}
            label="Active"
            value={data.pipeline.active}
            sub="Excl RTO/Cancel"
          />
        </Section>
      )}

      {show("rates") && (
        <Section title="Conversion Rates" icon={Percent}>
          <RateTile
            label="Onboard Rate"
            rate={data.rates.onboardConvRate}
            hint="RO → Onboard"
            icon={BarChart3}
          />
          <RateTile
            label="Posting Rate"
            rate={data.rates.postingRate}
            hint="Active → Posted"
            icon={Camera}
          />
          <RateTile
            label="Delivery Rate"
            rate={data.rates.deliveryRate}
            hint="Posted → Delivered"
            icon={Truck}
          />
          <RateTile
            label="Payment Rate"
            rate={data.rates.paymentRate}
            hint="Posted/Delivered paid"
            icon={Banknote}
          />
          <RateTile
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
          <TatKpi
            color="#3B6FD4"
            icon={Timer}
            label="RO → Onboard"
            days={data.tat.roToOb}
            info="Avg days from reach out to onboard date"
          />
          <TatKpi
            color="#B57514"
            icon={CheckCircle2}
            label="Onboard → Post"
            days={data.tat.obToPost}
            info="Avg days from onboard to post date"
          />
          <TatKpi
            color="#7B4FBF"
            icon={Clock}
            label="RO → Post"
            days={data.tat.roToPost}
            info="Avg days from reach out to post date"
          />
        </Section>
      )}

      {show("coverage") && (
        <Section title="Data Coverage" icon={Database}>
          <PctTile
            label="Email Coverage"
            pct={data.coverage.emailCoveragePct}
            hero={data.coverage.withEmail}
            sub={`${data.coverage.emailCoveragePct}% · of ${data.pipeline.total}`}
            icon={Mail}
          />
          <PctTile
            label="Bank Coverage"
            pct={data.coverage.bankCoveragePct}
            hero={data.coverage.withBank}
            sub={`${data.coverage.bankCoveragePct}% · of ${data.pipeline.active} active`}
            icon={Banknote}
          />
          <HeroKpi
            color="#3B6FD4"
            icon={<Box size={14} aria-hidden />}
            label="Order Placed"
            value={data.coverage.withOrder}
            sub=""
            info="Unique order IDs on posts"
          />
          <HeroKpi
            color="#3B6FD4"
            icon={<QrCode size={14} aria-hidden />}
            label="Tracking IDs"
            value={data.coverage.withTracking}
            sub=""
            info="Unique orders with a tracking ID"
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
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options.map(([optionValue, optionLabel]) => ({
          value: optionValue,
          label: optionLabel,
        }))}
        placeholder={options[0]?.[1] ?? `All ${label.toLowerCase()}`}
        searchPlaceholder={`Search ${label.toLowerCase()}…`}
      />
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
      <div className="acc-kpi-grid compliance-kpi-grid bento-stagger">
        {children}
      </div>
    </section>
  );
}

/** Tone → accent hex (sanctioned semantic palette — never gold). */
const TONE_HEX = {
  success: "#4F7C4D",
  warning: "#B57514",
  danger: "#C0392B",
} as const;

/**
 * Percent tile — HeroKpi visual DNA (top accent bar, tinted corner, icon
 * chip, count-up) plus the compliance progress bar (`.bento-bar` grow).
 * Local because the shipped `HeroKpi` primitive has no bar slot.
 *
 * VALUE HIERARCHY (legacy parity): the HERO number is the absolute count —
 * exactly what the old cards led with — and the percent lives in the sub
 * line + drives the bar/tone. Pass `hero` for the big number; `heroStatic`
 * renders un-animated after it (e.g. the "/120" of a fraction).
 */
function PctTile({
  label,
  pct,
  hero,
  heroStatic,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  pct: number;
  hero: number;
  heroStatic?: string;
  sub: string;
  icon: LucideIcon;
  tone?: "success" | "warning" | "danger";
}) {
  const color = TONE_HEX[tone ?? toneRate(pct)];
  return (
    <div className="bento-tile relative overflow-hidden rounded-[16px] border border-border bg-bg-white p-3.5">
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.10]"
        style={{ background: color }}
        aria-hidden
      />
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: color }}
        aria-hidden
      />
      <div className="mb-2 flex items-center gap-1.5 text-text-secondary">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-[8px]"
          style={{ background: `${color}1A`, color }}
        >
          <Icon size={14} aria-hidden />
        </span>
        <span className="truncate text-[0.64rem] font-bold uppercase tracking-[0.05em]">
          {label}
        </span>
      </div>
      <div className="text-[1.7rem] font-bold leading-none tracking-[-0.01em] tabular-nums text-text-primary">
        <CountUp
          value={hero}
          format={(x) => Math.round(x).toLocaleString("en-IN")}
        />
        {heroStatic}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-muted">
        <div
          className="bento-bar h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, background: color }}
        />
      </div>
      <div className="mt-1.5 truncate text-[0.68rem] leading-snug tabular-nums text-text-tertiary">
        {sub}
      </div>
    </div>
  );
}

/** Conversion-rate tile — num/den hero (legacy hierarchy) + pct detail/bar,
 * legacy tone rules. */
function RateTile({
  label,
  rate,
  hint,
  icon,
  invert = false,
}: {
  label: string;
  rate: RateBreakdown;
  hint: string;
  icon: LucideIcon;
  invert?: boolean;
}) {
  const tone = invert ? toneRtoRate(rate.pct) : toneRate(rate.pct);
  return (
    <PctTile
      label={label}
      pct={rate.pct}
      hero={rate.num}
      heroStatic={`/${rate.den}`}
      sub={`${rate.pct}% · ${hint}`}
      icon={icon}
      tone={tone}
    />
  );
}

/** TAT tile — HeroKpi with a "d" suffix; em-dash placeholder when null. */
function TatKpi({
  color,
  icon: Icon,
  label,
  days,
  info,
}: {
  color: string;
  icon: LucideIcon;
  label: string;
  days: number | null;
  info?: string;
}) {
  if (days == null) {
    return (
      <div className="bento-tile relative overflow-hidden rounded-[16px] border border-border bg-bg-white p-3.5">
        <span
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.10]"
          style={{ background: color }}
          aria-hidden
        />
        <span
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: color }}
          aria-hidden
        />
        <div className="mb-2 flex items-center gap-1.5 text-text-secondary">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-[8px]"
            style={{ background: `${color}1A`, color }}
          >
            <Icon size={14} aria-hidden />
          </span>
          <span className="truncate text-[0.64rem] font-bold uppercase tracking-[0.05em]">
            {label}
          </span>
          {info && <InfoDot text={info} />}
        </div>
        <div className="text-[1.7rem] font-bold leading-none tracking-[-0.01em] tabular-nums text-text-primary">
          —
        </div>
        <div className="mt-1.5 text-[0.68rem] leading-snug tabular-nums text-text-tertiary" />
      </div>
    );
  }
  return (
    <HeroKpi
      color={color}
      icon={<Icon size={14} aria-hidden />}
      label={label}
      value={days}
      suffix="d"
      sub=""
      info={info}
    />
  );
}

function CampaignBreakdown({ rows }: { rows: ComplianceData["campaigns"] }) {
  if (rows.length === 0) {
    return (
      <section className="bento-tile min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:rounded-2xl sm:p-4">
        <h2 className="text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-text-primary">
          Campaign Breakdown
        </h2>
        <p className="mt-2 text-xs text-text-tertiary">No campaign data yet.</p>
      </section>
    );
  }
  return (
    <section className="bento-tile flex min-w-0 max-w-full flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:gap-3 sm:rounded-2xl sm:p-4">
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
      <section className="bento-tile min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:rounded-2xl sm:p-4">
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
    <section className="bento-tile flex min-w-0 max-w-full flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-bg-white p-2 sm:gap-3 sm:rounded-2xl sm:p-4">
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

function toneRate(value: number): "success" | "warning" | "danger" {
  if (value >= 80) return "success";
  if (value >= 50) return "warning";
  return "danger";
}

function toneRtoRate(value: number): "success" | "warning" | "danger" {
  return value > 20 ? "danger" : "success";
}
