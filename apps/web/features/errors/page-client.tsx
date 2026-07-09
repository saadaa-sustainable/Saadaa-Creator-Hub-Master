"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertOctagon,
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  ExternalLink,
  Filter,
  Info,
  Instagram,
  Loader2,
  Mail,
  MailX,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Truck,
  Users,
  Wallet,
  WifiOff,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate, workflowStatusLabel } from "@/lib/formatters";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { resendBlockedCollabEmail } from "./actions";
import type {
  AuditViolation,
  BlockedEmailRow,
  ErrorPortalData,
  ErrorSeverity,
  MissingEmailRow,
  SystemErrorRow,
} from "./types";

const BLOCKED_EMAIL_TYPES = new Set([
  "collab_email_blocked",
  "collab_email_send_failed",
]);

type Severity = "all" | "HIGH" | "MEDIUM" | "LOW";

export function ErrorPortalBody({ data }: { data: ErrorPortalData }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [severity, setSeverity] = useState<Severity>("all");
  const [search, setSearch] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const normalizedQuery = search.trim().toLowerCase();

  const filteredViolations = useMemo(
    () =>
      data.violations.filter((v) => {
        if (severity !== "all" && v.severity !== severity) return false;
        if (normalizedQuery) {
          const hay = `${v.type} ${v.details} ${v.key ?? ""}`.toLowerCase();
          if (!hay.includes(normalizedQuery)) return false;
        }
        return true;
      }),
    [data.violations, severity, normalizedQuery],
  );

  const filteredSystemErrors = useMemo(
    () =>
      data.systemErrors.filter((e) => {
        // Collab-email blocks/failures have their own actionable card below.
        if (BLOCKED_EMAIL_TYPES.has(e.type)) return false;
        if (!showResolved && e.resolved) return false;
        if (normalizedQuery) {
          const hay = `${e.type} ${e.key ?? ""} ${e.message} ${e.source ?? ""}`.toLowerCase();
          if (!hay.includes(normalizedQuery)) return false;
        }
        return true;
      }),
    [data.systemErrors, showResolved, normalizedQuery],
  );

  const apiFails = useMemo(
    () =>
      data.systemErrors.filter((e) =>
        [
          "ig_fetch",
          "apify_fail",
          "meta_fetch_failed",
          "meta_profile_unavailable",
        ].includes(e.type),
      ),
    [data.systemErrors],
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden sm:gap-4">
      <FilterRow
        severity={severity}
        search={search}
        showResolved={showResolved}
        onSeverityChange={setSeverity}
        onSearchChange={setSearch}
        onResolvedToggle={setShowResolved}
        onRefresh={() => {
          setRefreshing(true);
          router.refresh();
          setTimeout(() => setRefreshing(false), 600);
        }}
        refreshing={refreshing}
        lastScannedAt={data.lastScannedAt}
      />

      <KpiStrip
        summary={data.summary}
        onBlockedClick={() =>
          document
            .getElementById("blocked-emails-card")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      />

      {/* Bento layout — desktop 12-col, mobile single */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {data.blockedEmails.length > 0 && (
          <div
            id="blocked-emails-card"
            className="lg:col-span-12 min-w-0 scroll-mt-24"
          >
            <BlockedEmailsCard rows={data.blockedEmails} />
          </div>
        )}
        <div className="lg:col-span-12 min-w-0">
          <DataHealthGrid health={data.health} />
        </div>
        <div className="lg:col-span-7 min-w-0">
          <ViolationsTable rows={filteredViolations} />
        </div>
        <div className="lg:col-span-5 min-w-0">
          <MissingEmailsCard rows={data.missingEmails} />
        </div>
        {apiFails.length > 0 && (
          <div className="lg:col-span-12 min-w-0">
            <ApiFailsTable rows={apiFails} />
          </div>
        )}
        <div className="lg:col-span-12 min-w-0">
          <SystemErrorsTable rows={filteredSystemErrors} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter row
// ─────────────────────────────────────────────────────────────────────────────

function FilterRow({
  severity,
  search,
  showResolved,
  onSeverityChange,
  onSearchChange,
  onResolvedToggle,
  onRefresh,
  refreshing,
  lastScannedAt,
}: {
  severity: Severity;
  search: string;
  showResolved: boolean;
  onSeverityChange: (v: Severity) => void;
  onSearchChange: (v: string) => void;
  onResolvedToggle: (v: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  lastScannedAt: string;
}) {
  return (
    <div className="onboarding-filter-card">
      <div className="onboarding-filter-grid">
        <label className="onboarding-filter-field acc-filter-search">
          <span>
            <Search size={10} aria-hidden /> Search
          </span>
          <input
            type="text"
            value={search}
            placeholder="Type, key, message…"
            onChange={(e) => onSearchChange(e.target.value)}
            className="onboarding-filter-select"
          />
        </label>
        <label className="onboarding-filter-field">
          <span>
            <Filter size={10} aria-hidden /> Severity
          </span>
          <SearchableSelect
            value={severity}
            onChange={(v) => onSeverityChange(v as Severity)}
            options={[
              { value: "all", label: "All severities" },
              { value: "HIGH", label: "Critical (HIGH)" },
              { value: "MEDIUM", label: "Warnings (MEDIUM)" },
              { value: "LOW", label: "Info (LOW)" },
            ]}
            placeholder="All severities"
            searchPlaceholder="Search…"
          />
        </label>
        <label className="onboarding-filter-field">
          <span>
            <CheckCircle2 size={10} aria-hidden /> Show Resolved
          </span>
          <SearchableSelect
            value={showResolved ? "yes" : "no"}
            onChange={(v) => onResolvedToggle(v === "yes")}
            options={[
              { value: "no", label: "Unresolved only" },
              { value: "yes", label: "Include resolved" },
            ]}
            placeholder="Unresolved only"
            searchPlaceholder="Search…"
          />
        </label>
        <div className="onboarding-filter-actions">
          <span className="text-[0.6rem] text-text-tertiary tabular self-center mr-2 inline-flex items-center gap-1">
            <Clock size={10} aria-hidden /> Scanned {formatRelativeTime(lastScannedAt)}
          </span>
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
            Re-scan
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(t).toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Strip — 5 cards using shared .acc-kpi chrome
// ─────────────────────────────────────────────────────────────────────────────

function KpiStrip({
  summary,
  onBlockedClick,
}: {
  summary: ErrorPortalData["summary"];
  onBlockedClick: () => void;
}) {
  return (
    <div className="acc-kpi-grid">
      <KpiTile
        tone="danger"
        icon={ShieldAlert}
        label="Email Blocked"
        primary={String(summary.blockedEmails)}
        secondary="Missing docs · retry"
        onClick={summary.blockedEmails > 0 ? onBlockedClick : undefined}
      />
      <KpiTile
        tone="danger"
        icon={AlertOctagon}
        label="Critical"
        primary={String(summary.high)}
        secondary="Invalid data · dupes"
      />
      <KpiTile
        tone="warning"
        icon={AlertTriangle}
        label="Warnings"
        primary={String(summary.medium)}
        secondary="Flow issues"
      />
      <KpiTile
        tone="muted"
        icon={Info}
        label="Info"
        primary={String(summary.low)}
        secondary="Housekeeping"
      />
      <KpiTile
        tone="accent"
        icon={Instagram}
        label="API Fails"
        primary={String(summary.apiFails)}
        secondary="IG / Apify"
      />
      <KpiTile
        tone="warning"
        icon={WifiOff}
        label="Meta Fetch Fails"
        primary={String(summary.metaFetchFails)}
        secondary="API errored — retry"
      />
      <KpiTile
        tone="muted"
        icon={UserX}
        label="Profile Unavailable"
        primary={String(summary.metaProfileUnavailable)}
        secondary="Personal / deactivated"
      />
      <KpiTile
        tone="danger"
        icon={Mail}
        label="Missing Email"
        primary={String(summary.missingEmail)}
        secondary="Onboarded, not sent"
      />
    </div>
  );
}

function KpiTile({
  tone,
  icon: Icon,
  label,
  primary,
  secondary,
  onClick,
}: {
  tone: "accent" | "info" | "warning" | "success" | "danger" | "muted";
  icon: LucideIcon;
  label: string;
  primary: string;
  secondary: string;
  onClick?: () => void;
}) {
  const toneCls = {
    accent: "acc-kpi--accent",
    info: "acc-kpi--info",
    warning: "acc-kpi--warning",
    success: "acc-kpi--success",
    danger: "acc-kpi--danger",
    muted: "acc-kpi--muted",
  }[tone];
  const inner = (
    <>
      <div className="acc-kpi__head">
        <span className="acc-kpi__icon" aria-hidden>
          <Icon size={14} />
        </span>
        <span className="acc-kpi__label">{label}</span>
      </div>
      <div className="acc-kpi__primary">{primary}</div>
      <div className="acc-kpi__secondary">{secondary}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "acc-kpi text-left transition-transform hover:scale-[1.02] hover:shadow-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[--accent]",
          toneCls,
        )}
        title="Jump to blocked emails"
      >
        {inner}
      </button>
    );
  }
  return <div className={cn("acc-kpi", toneCls)}>{inner}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Health grid — 10 stat tiles in 2 / 5 grid
// ─────────────────────────────────────────────────────────────────────────────

function DataHealthGrid({ health }: { health: ErrorPortalData["health"] }) {
  const tiles: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    tone: string;
    tooltip?: string;
  }> = [
    {
      label: "Reach Out",
      value: String(health.reachOut),
      icon: Send,
      tone: "text-text-secondary",
    },
    {
      label: "Onboard",
      value: String(health.onBoard),
      icon: Users,
      tone: "text-warning",
    },
    {
      label: "Posted",
      value: String(health.posted),
      icon: Instagram,
      tone: "text-[#E1306C]",
    },
    {
      label: "Delivered",
      value: String(health.delivered),
      icon: Truck,
      tone: "text-success",
    },
    {
      label: "Missing Bank",
      value: String(health.missingBank),
      icon: Wallet,
      tone: health.missingBank > 0 ? "text-danger" : "text-text-tertiary",
    },
    {
      label: "Missing Email",
      value: String(health.missingEmail),
      icon: Mail,
      tone: health.missingEmail > 0 ? "text-danger" : "text-text-tertiary",
    },
    {
      label: "Missing Tracking",
      value: String(health.missingTracking),
      icon: PackageCheck,
      tone: health.missingTracking > 0 ? "text-warning" : "text-text-tertiary",
    },
    {
      label: "Missing Order",
      value: String(health.missingOrder),
      icon: Box,
      tone: health.missingOrder > 0 ? "text-warning" : "text-text-tertiary",
    },
    {
      label: "Missing Post Link",
      value: String(health.missingPostLink),
      icon: ExternalLink,
      tone: health.missingPostLink > 0 ? "text-warning" : "text-text-tertiary",
    },
    {
      label: "Payments Due",
      value: String(health.paymentsDue),
      icon: CreditCard,
      tone: health.paymentsDue > 0 ? "text-warning" : "text-text-tertiary",
    },
  ];
  return (
    <Card title="Data Health Overview" icon={Database}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-2.5">
        {tiles.map((t) => (
          <article
            key={t.label}
            className="group relative rounded-xl bg-bg-muted/40 border border-border p-2 sm:p-2.5 flex flex-col gap-0.5 min-w-0 transition-all hover:shadow-sm hover:-translate-y-0.5 hover:border-[--accent]/40"
          >
            <header className="flex items-center justify-between gap-1.5">
              <span className="text-[0.5rem] sm:text-[0.55rem] uppercase tracking-[0.06em] font-extrabold text-text-tertiary truncate">
                {t.label}
              </span>
              <span
                className={cn(
                  "inline-flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-bg-white border border-border",
                  t.tone,
                )}
              >
                <t.icon size={9} aria-hidden />
              </span>
            </header>
            <div
              className={cn(
                "text-lg sm:text-xl font-extrabold tabular leading-none",
                t.tone,
              )}
            >
              {t.value}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

function ViolationsTable({ rows }: { rows: AuditViolation[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Rule Violations" icon={AlertTriangle}>
        <p className="text-[0.7rem] text-success font-bold inline-flex items-center gap-1.5">
          <CheckCircle2 size={12} aria-hidden /> No rule violations found.
        </p>
      </Card>
    );
  }
  return (
    <Card
      title="Rule Violations"
      icon={AlertTriangle}
      subtitle={`${rows.length} open`}
    >
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[520px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-left pb-2 pr-3">Severity</th>
              <th className="text-left pb-2 px-1.5">Type</th>
              <th className="text-left pb-2 pl-1.5">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v, i) => (
              <tr
                key={`${v.type}-${v.key}-${i}`}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 pr-3">
                  <SeverityPill severity={v.severity} />
                </td>
                <td className="py-1.5 px-1.5 font-extrabold text-text-primary text-[0.62rem]">
                  {TYPE_LABEL[v.type] ?? v.type}
                </td>
                <td className="py-1.5 pl-1.5 text-text-secondary">{v.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MissingEmailsCard({ rows }: { rows: MissingEmailRow[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Missing Collab Emails" icon={Mail}>
        <p className="text-[0.7rem] text-success font-bold inline-flex items-center gap-1.5">
          <CheckCircle2 size={12} aria-hidden /> All onboarded creators emailed.
        </p>
      </Card>
    );
  }
  return (
    <Card
      title="Missing Collab Emails"
      icon={Mail}
      subtitle={`${rows.length} pending`}
    >
      <ul className="flex flex-col gap-2 max-h-[380px] overflow-y-auto">
        {rows.slice(0, 30).map((r) => (
          <li
            key={r.post_id}
            className="rounded-xl border border-border bg-bg-muted/30 p-2.5 flex flex-col gap-1 text-[0.7rem]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-extrabold text-text-primary truncate">
                {r.inf_name ?? r.username ?? r.inf_id ?? r.post_id}
              </span>
              <span className="text-[0.55rem] text-text-tertiary tabular whitespace-nowrap">
                {r.post_id}
                {r.collab_id && (
                  <span className="text-[0.7rem]"> · {r.collab_id}</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-[0.6rem] text-text-secondary">
              {r.username && <span>@{r.username}</span>}
              {r.campaign_id && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-border bg-bg-white tabular text-text-tertiary text-[0.55rem]">
                  {r.campaign_id}
                </span>
              )}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-border bg-bg-white text-text-secondary text-[0.55rem]">
                {workflowStatusLabel(r.workflow_status)}
              </span>
            </div>
            <div className="text-[0.55rem] text-text-tertiary">
              Onboarded {formatDate(r.onboard_date) ?? "—"}
            </div>
          </li>
        ))}
        {rows.length > 30 && (
          <li className="text-[0.6rem] text-text-tertiary text-center pt-1">
            …and {rows.length - 30} more
          </li>
        )}
      </ul>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocked collab emails — actionable "Send again" cards
// ─────────────────────────────────────────────────────────────────────────────

function BlockedEmailsCard({ rows }: { rows: BlockedEmailRow[] }) {
  return (
    <Card
      title="Collab Emails Blocked"
      icon={MailX}
      subtitle={`${rows.length} not sent`}
    >
      <p className="text-[0.62rem] text-text-secondary -mt-1 mb-1">
        These emails were <strong>not sent</strong> to the creator — the send was
        blocked because a required attachment (Campaign Brief / T&amp;C) or the
        sender CC was missing, or SMTP failed. Fix the cause, then retry.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {rows.map((r) => (
          <BlockedEmailItem key={`${r.post_id}-${r.kind}`} row={r} />
        ))}
      </div>
    </Card>
  );
}

function BlockedEmailItem({ row }: { row: BlockedEmailRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const onResend = () => {
    startTransition(async () => {
      const res = await resendBlockedCollabEmail(row.post_id);
      if (res.ok) {
        setDone(true);
        toast.success(`Email sent to ${res.sentTo ?? "creator"}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Still blocked — fix the cause and retry");
      }
    });
  };

  return (
    <article className="rounded-xl border border-danger/25 bg-danger-bg/40 p-2.5 flex flex-col gap-2 text-[0.7rem] min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-extrabold text-text-primary truncate">
          {row.inf_name ?? row.username ?? row.post_id}
        </span>
        <span className="text-[0.55rem] text-text-tertiary tabular whitespace-nowrap">
          {row.collab_id ?? row.post_id}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-[0.6rem] text-text-secondary">
        {row.username && <span>@{row.username}</span>}
        {row.campaign_id && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-border bg-bg-white tabular text-text-tertiary text-[0.55rem]">
            {row.campaign_id}
          </span>
        )}
        {row.workflow_status && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-border bg-bg-white text-text-secondary text-[0.55rem]">
            {workflowStatusLabel(row.workflow_status)}
          </span>
        )}
        <span
          className={cn(
            "inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.55rem] font-extrabold border whitespace-nowrap",
            row.kind === "send_failed"
              ? "bg-warning-bg text-warning border-warning/20"
              : "bg-danger-bg text-danger border-danger/20",
          )}
        >
          {row.kind === "send_failed" ? "SMTP failed" : "Blocked"}
        </span>
      </div>
      <p className="text-[0.62rem] text-danger leading-snug flex items-start gap-1">
        <AlertTriangle size={11} aria-hidden className="mt-0.5 shrink-0" />
        <span className="min-w-0">{row.reason}</span>
      </p>
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[0.55rem] text-text-tertiary">
          {formatRelativeTime(row.created_at)}
        </span>
        <button
          type="button"
          onClick={onResend}
          disabled={pending || done}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[0.66rem] font-extrabold border transition-all",
            done
              ? "bg-success-bg text-success border-success/20 cursor-default"
              : "bg-[--accent] text-text-primary border-[--accent] hover:scale-[1.03] hover:shadow-md active:scale-[0.97] disabled:opacity-70 disabled:cursor-wait",
          )}
        >
          {done ? (
            <>
              <CheckCircle2 size={12} aria-hidden /> Sent
            </>
          ) : pending ? (
            <>
              <Loader2 size={12} className="animate-spin" aria-hidden /> Sending…
            </>
          ) : (
            <>
              <Send size={12} aria-hidden /> Send again
            </>
          )}
        </button>
      </div>
    </article>
  );
}

function ApiFailsTable({ rows }: { rows: SystemErrorRow[] }) {
  return (
    <Card
      title="API Fetch Failures"
      icon={Instagram}
      subtitle={`${rows.length} unresolved`}
    >
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[640px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-left pb-2 pr-3">Type</th>
              <th className="text-left pb-2 px-1.5">Key</th>
              <th className="text-left pb-2 px-1.5">Message</th>
              <th className="text-left pb-2 px-1.5">Source</th>
              <th className="text-right pb-2 pl-1.5">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.id}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 pr-3">
                  <TypePill type={e.type} />
                </td>
                <td className="py-1.5 px-1.5 font-bold text-text-primary truncate max-w-[160px]">
                  {e.key ?? "—"}
                </td>
                <td className="py-1.5 px-1.5 text-text-secondary truncate max-w-[320px]">
                  {e.message}
                </td>
                <td className="py-1.5 px-1.5 text-text-tertiary text-[0.6rem] tabular">
                  {e.source ?? "—"}
                </td>
                <td className="py-1.5 pl-1.5 text-right tabular text-text-tertiary text-[0.6rem]">
                  {formatRelativeTime(e.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SystemErrorsTable({ rows }: { rows: SystemErrorRow[] }) {
  if (rows.length === 0) {
    return (
      <Card title="System Errors" icon={Database}>
        <p className="text-[0.7rem] text-success font-bold inline-flex items-center gap-1.5">
          <CheckCircle2 size={12} aria-hidden /> System error log is clear.
        </p>
      </Card>
    );
  }
  return (
    <Card
      title="System Errors"
      icon={Database}
      subtitle={`${rows.length} rows`}
    >
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-[0.65rem] sm:text-xs min-w-[640px]">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-[0.06em] text-[0.5rem] sm:text-[0.55rem] font-extrabold border-b border-border">
              <th className="text-left pb-2 pr-3">Type</th>
              <th className="text-left pb-2 px-1.5">Key</th>
              <th className="text-left pb-2 px-1.5">Message</th>
              <th className="text-left pb-2 px-1.5">Source</th>
              <th className="text-right pb-2 px-1.5">Created</th>
              <th className="text-center pb-2 pl-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.id}
                className="border-t border-border hover:bg-bg-muted/40 transition-colors"
              >
                <td className="py-1.5 pr-3">
                  <TypePill type={e.type} />
                </td>
                <td className="py-1.5 px-1.5 font-bold text-text-primary truncate max-w-[160px]">
                  {e.key ?? "—"}
                </td>
                <td className="py-1.5 px-1.5 text-text-secondary truncate max-w-[320px]">
                  {e.message}
                </td>
                <td className="py-1.5 px-1.5 text-text-tertiary text-[0.6rem] tabular">
                  {e.source ?? "—"}
                </td>
                <td className="py-1.5 px-1.5 text-right tabular text-text-tertiary text-[0.6rem]">
                  {formatRelativeTime(e.created_at)}
                </td>
                <td className="py-1.5 pl-1.5 text-center">
                  {e.resolved ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.55rem] font-extrabold bg-success-bg text-success border border-success/20">
                      <CheckCircle2 size={9} aria-hidden /> Resolved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.55rem] font-extrabold bg-warning-bg text-warning border border-warning/20">
                      <Clock size={9} aria-hidden /> Open
                    </span>
                  )}
                </td>
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
  icon: Icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="h-full rounded-2xl bg-bg-white border border-border p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3 min-w-0">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[0.75rem] sm:text-sm font-extrabold uppercase tracking-[0.06em] text-text-primary inline-flex items-center gap-1.5">
          {Icon && <Icon size={12} aria-hidden />} {title}
        </h3>
        {subtitle && (
          <span className="text-[0.6rem] text-text-tertiary">{subtitle}</span>
        )}
      </header>
      {children}
    </section>
  );
}

function SeverityPill({ severity }: { severity: ErrorSeverity }) {
  const tone = {
    HIGH: "bg-danger-bg text-danger border-danger/20",
    MEDIUM: "bg-warning-bg text-warning border-warning/20",
    LOW: "bg-bg-muted text-text-secondary border-border",
  }[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[0.55rem] sm:text-[0.6rem] font-extrabold border whitespace-nowrap",
        tone,
      )}
    >
      {severity === "HIGH" ? "Critical" : severity === "MEDIUM" ? "Warning" : "Info"}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  const tone = type.startsWith("apify")
    ? "bg-[#FBE9F1] text-[#B54F7A] border-[#B54F7A]/15"
    : type === "ig_fetch"
      ? "bg-[#E2F1FA] text-[#06B6D4] border-[#06B6D4]/20"
      : type === "collab_email"
        ? "bg-warning-bg text-warning border-warning/20"
        : type.startsWith("payment")
          ? "bg-[#E8EEFB] text-[#3B6FD4] border-[#3B6FD4]/15"
          : "bg-bg-muted text-text-secondary border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[0.55rem] font-extrabold border whitespace-nowrap tabular",
        tone,
      )}
    >
      {type}
    </span>
  );
}

const TYPE_LABEL: Record<string, string> = {
  INVALID_POST_ID: "Invalid POST_ID",
  DUPLICATE_UTR: "Duplicate UTR",
  PAYMENT_BEFORE_POSTING: "Payment before posting",
  MISSING_BANK_DETAILS: "Missing bank details",
  MISSING_TRACKING: "Missing tracking",
};
