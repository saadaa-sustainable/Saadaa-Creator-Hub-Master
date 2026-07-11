"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Loader2,
  Megaphone,
  RefreshCcw,
  Search,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DeactivatedBadge } from "@/components/ui/status-pill";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatFollowers, formatRupees } from "@/lib/formatters";
import { WhCategoryBadge } from "@/features/ad-status/ad-board";
import {
  refreshPartnershipForCreator,
  resendPartnershipForCreator,
} from "@/features/posting/partnership-actions";
import type {
  PartnershipBucket,
  PartnershipCard,
  PartnershipBoardData,
  PartnershipFilters,
} from "./partnership-queries";

/**
 * Partnership Status board — 5-lane kanban over per-creator Meta
 * branded-content permission states, styled like the other workflow stages
 * (onboarding filter card → acc-kpi strip → acc-kanban lanes).
 *
 * Lanes (business chronology): Requested → Rejected → Accepted (Not Tested)
 * → Accepted & Tested (creator has warehouse-matched ads) → Failure on
 * Sending (invite/resend errored; retry offered).
 *
 * "Real-time": on mount every REQUESTED (pending) creator is re-checked
 * against the live Meta API (staggered, capped) so accepts / rejects that
 * happened since the last visit surface immediately — the server action also
 * stamps the DB (posts + creators). Refresh re-runs the sweep on demand.
 */
const LANES: Array<{
  id: PartnershipBucket;
  label: string;
  icon: typeof Clock3;
  toneClass: string;
  empty: string;
}> = [
  {
    id: "requested",
    label: "Requested",
    icon: Clock3,
    toneClass: "text-warning",
    empty: "No pending partnership requests.",
  },
  {
    id: "rejected",
    label: "Rejected",
    icon: XCircle,
    toneClass: "text-danger",
    empty: "No rejected requests. Good sign.",
  },
  {
    id: "accepted",
    label: "Accepted · Not Tested",
    icon: CheckCircle2,
    toneClass: "text-success",
    empty: "No accepted partnerships awaiting testing.",
  },
  {
    id: "accepted-tested",
    label: "Accepted & Tested",
    icon: FlaskConical,
    toneClass: "text-info",
    empty: "No tested partnerships yet.",
  },
  {
    id: "send-failed",
    label: "Failure on Sending",
    icon: AlertTriangle,
    toneClass: "text-danger",
    empty: "No send failures. All invites went out.",
  },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "revoked", label: "Revoked" },
];

const TEST_STATUS_OPTIONS = [
  { value: "", label: "All test results" },
  { value: "Incremental Winner", label: "Incremental Winner" },
  { value: "Winner", label: "Winner" },
  { value: "P0 analysis", label: "P0 Analysis" },
  { value: "P1 analysis", label: "P1 Analysis" },
  { value: "P2 analysis", label: "P2 Analysis" },
  { value: "Discarded", label: "Discarded" },
];

const FILTER_KEYS = [
  "q",
  "campaign",
  "status",
  "testStatus",
  "team",
  "sentFrom",
  "sentTo",
  "postedFrom",
  "postedTo",
  "onboardFrom",
  "onboardTo",
  "adId",
  "adName",
] as const satisfies readonly (keyof PartnershipFilters)[];

/** Max creators live-checked per sweep — keeps Meta call volume polite. */
const REFRESH_CAP = 20;
const REFRESH_STAGGER_MS = 350;

const fmtStamp = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function PartnershipBoard({
  data,
  initialFilters,
}: {
  data: PartnershipBoardData;
  initialFilters: PartnershipFilters;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pendingNav, startNav] = useTransition();
  const [cards, setCards] = useState<PartnershipCard[]>(data.cards);
  const [sweeping, setSweeping] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const sweepStarted = useRef(false);

  useEffect(() => setCards(data.cards), [data.cards]);

  const setParam = useCallback(
    (key: keyof PartnershipFilters, value: string | undefined) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      startNav(() =>
        router.replace(`?${next.toString()}` as never, { scroll: false }),
      );
    },
    [params, router],
  );

  // One date-range picker over three bases (Requested / Posted / Onboarding).
  // The active basis is inferred from which URL pair is set; switching the
  // basis moves the current range onto the new pair atomically.
  const DATE_PAIRS = {
    requested: ["sentFrom", "sentTo"],
    posted: ["postedFrom", "postedTo"],
    onboard: ["onboardFrom", "onboardTo"],
  } as const;
  const dateMode: keyof typeof DATE_PAIRS =
    initialFilters.postedFrom || initialFilters.postedTo
      ? "posted"
      : initialFilters.onboardFrom || initialFilters.onboardTo
        ? "onboard"
        : "requested";
  const dateFrom =
    initialFilters.postedFrom ??
    initialFilters.onboardFrom ??
    initialFilters.sentFrom ??
    "";
  const dateTo =
    initialFilters.postedTo ??
    initialFilters.onboardTo ??
    initialFilters.sentTo ??
    "";
  const applyDateRange = useCallback(
    (mode: keyof typeof DATE_PAIRS, from: string, to: string) => {
      const next = new URLSearchParams(params.toString());
      Object.values(DATE_PAIRS)
        .flat()
        .forEach((k) => next.delete(k));
      if (from) next.set(DATE_PAIRS[mode][0], from);
      if (to) next.set(DATE_PAIRS[mode][1], to);
      startNav(() =>
        router.replace(`?${next.toString()}` as never, { scroll: false }),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, router],
  );
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = useCallback(
    (value: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(
        () => setParam("q", value.trim() || undefined),
        300,
      );
    },
    [setParam],
  );
  const clearAll = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    FILTER_KEYS.forEach((k) => next.delete(k));
    startNav(() =>
      router.replace(`?${next.toString()}` as never, { scroll: false }),
    );
  }, [params, router]);
  const hasAnyFilter = FILTER_KEYS.some((k) => params.get(k));

  // Live sweep — re-check pending creators against Meta, newest first.
  const runSweep = useCallback(
    async (notify: boolean) => {
      const targets = cards
        .filter((c) => c.bucket === "requested" && !c.infId.startsWith("@"))
        .slice(0, REFRESH_CAP);
      if (targets.length === 0) {
        if (notify) toast.info("No pending requests to refresh.");
        return;
      }
      setSweeping(true);
      let changed = 0;
      for (const t of targets) {
        try {
          const res = await refreshPartnershipForCreator(t.infId);
          if (res.ok && res.state && res.state !== "pending") {
            changed += 1;
            const nowIso = new Date().toISOString();
            setCards((prev) =>
              prev.map((c) =>
                c.infId === t.infId
                  ? {
                      ...c,
                      state: res.state!,
                      bucket:
                        res.state === "approved"
                          ? c.adsSummary
                            ? "accepted-tested"
                            : "accepted"
                          : "rejected",
                      approvedAt:
                        res.state === "approved"
                          ? (c.approvedAt ?? nowIso)
                          : c.approvedAt,
                      declinedAt:
                        res.state === "rejected" || res.state === "revoked"
                          ? (c.declinedAt ?? nowIso)
                          : c.declinedAt,
                    }
                  : c,
              ),
            );
          }
        } catch {
          // fail-soft per creator; the sweep continues
        }
        await new Promise((r) => setTimeout(r, REFRESH_STAGGER_MS));
      }
      setSweeping(false);
      if (notify) {
        toast.success(
          changed > 0
            ? `${changed} creator${changed > 1 ? "s" : ""} changed status.`
            : "All pending requests are still awaiting the creators.",
        );
      }
      if (changed > 0) router.refresh();
    },
    [cards, router],
  );

  // Auto-sweep once per tab visit so decisions show without a manual click.
  useEffect(() => {
    if (sweepStarted.current) return;
    sweepStarted.current = true;
    if (data.cards.some((c) => c.bucket === "requested")) void runSweep(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resend = async (card: PartnershipCard) => {
    setResending(card.infId);
    try {
      const res = await resendPartnershipForCreator(card.infId);
      if (!res.ok) {
        toast.error(res.error ?? "Resend failed");
        return;
      }
      toast.success(
        `Partnership request resent to @${card.username ?? card.infId}.`,
      );
      const nowIso = new Date().toISOString();
      setCards((prev) =>
        prev.map((c) =>
          c.infId === card.infId
            ? {
                ...c,
                state: "pending",
                bucket: "requested",
                sentAt: nowIso,
                errorMessage: null,
                errorAt: null,
              }
            : c,
        ),
      );
    } finally {
      setResending(null);
    }
  };

  const lanes = useMemo(() => {
    const map = new Map<PartnershipBucket, PartnershipCard[]>();
    for (const l of LANES) map.set(l.id, []);
    for (const c of cards) map.get(c.bucket)?.push(c);
    return map;
  }, [cards]);

  const laneCount = (b: PartnershipBucket) => lanes.get(b)?.length ?? 0;

  return (
    <>
      {/* Filter bar — ABOVE the KPI strip (project rule). */}
      <div className="onboarding-filter-card" aria-busy={pendingNav}>
        <div className="onboarding-filter-grid">
          <label className="onboarding-filter-field">
            <span>Search</span>
            <span className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-text-tertiary"
                aria-hidden
              />
              <input
                type="search"
                defaultValue={initialFilters.q ?? ""}
                placeholder="INF ID, name, username…"
                onChange={(e) => onSearch(e.target.value)}
                className="onboarding-filter-select pl-7"
              />
            </span>
          </label>
          <FilterSelect
            label="Campaign"
            value={initialFilters.campaign ?? ""}
            onChange={(v) => setParam("campaign", v)}
            options={[
              { value: "", label: "All campaigns" },
              ...data.campaignOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
          <FilterSelect
            label="Partnership Status"
            value={initialFilters.status ?? ""}
            onChange={(v) => setParam("status", v)}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Creative Test Status"
            value={initialFilters.testStatus ?? ""}
            onChange={(v) => setParam("testStatus", v)}
            options={TEST_STATUS_OPTIONS}
          />
          <FilterSelect
            label="Team Member"
            value={initialFilters.team ?? ""}
            onChange={(v) => setParam("team", v)}
            options={[
              { value: "", label: "All team members" },
              ...data.teamOptions.map((t) => ({ value: t, label: t })),
            ]}
          />
          <label className="onboarding-filter-field">
            <span>Date range</span>
            <DateRangePicker
              label="Date range"
              value={{ from: dateFrom, to: dateTo }}
              modes={[
                { value: "requested", label: "Requested" },
                { value: "posted", label: "Posted" },
                { value: "onboard", label: "Onboarding" },
              ]}
              mode={dateMode}
              onModeChange={(m) =>
                applyDateRange(
                  m as "requested" | "posted" | "onboard",
                  dateFrom,
                  dateTo,
                )
              }
              onChange={(r) => applyDateRange(dateMode, r.from, r.to)}
            />
          </label>
          <label className="onboarding-filter-field">
            <span>Ad ID</span>
            <input
              type="text"
              defaultValue={initialFilters.adId ?? ""}
              placeholder="Warehouse ad id…"
              onBlur={(e) => setParam("adId", e.target.value || undefined)}
              className="onboarding-filter-select"
            />
          </label>
          <label className="onboarding-filter-field">
            <span>Ad Name</span>
            <input
              type="text"
              defaultValue={initialFilters.adName ?? ""}
              placeholder="Ad name contains…"
              onBlur={(e) => setParam("adName", e.target.value || undefined)}
              className="onboarding-filter-select"
            />
          </label>
          <div className="onboarding-filter-actions">
            {hasAnyFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" aria-hidden /> Clear
              </Button>
            )}
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-[9px] border border-border bg-bg-white px-3 py-2 text-[0.78rem] font-semibold text-text-secondary transition-colors hover:bg-bg-alt disabled:opacity-60"
              onClick={() => void runSweep(true)}
              disabled={sweeping}
              title="Re-check every pending request against Instagram"
            >
              {sweeping ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <RefreshCcw size={13} aria-hidden />
              )}
              {sweeping ? "Checking…" : "Refresh statuses"}
            </button>
          </div>
        </div>
      </div>

      {/* KPI strip — one tile per lane, shared acc-kpi vocabulary. */}
      <div className="acc-kpi-grid">
        <PartnershipKpi
          tone="warning"
          icon={<Clock3 size={16} aria-hidden />}
          label="Requested"
          value={laneCount("requested")}
          secondary="Awaiting creators"
        />
        <PartnershipKpi
          tone="danger"
          icon={<XCircle size={16} aria-hidden />}
          label="Rejected"
          value={laneCount("rejected")}
          secondary="Declined / revoked"
        />
        <PartnershipKpi
          tone="success"
          icon={<CheckCircle2 size={16} aria-hidden />}
          label="Accepted · Not Tested"
          value={laneCount("accepted")}
          secondary="No ads run yet"
        />
        <PartnershipKpi
          tone="info"
          icon={<FlaskConical size={16} aria-hidden />}
          label="Accepted & Tested"
          value={laneCount("accepted-tested")}
          secondary="Creative in Meta Ads"
        />
        <PartnershipKpi
          tone="muted"
          icon={<AlertTriangle size={16} aria-hidden />}
          label="Send Failures"
          value={laneCount("send-failed")}
          secondary="Invite could not send"
        />
      </div>

      <div className="metric-section-heading">
        <strong>Partnership permission queue</strong>
        <InfoTooltip
          title="Partnership permission queue"
          content="One creator per card, grouped by their latest Instagram partnership-ad permission state. Accepted and tested means at least one matched ad has already run."
          side="bottom"
          align="start"
        />
      </div>

      {/* Kanban — 5 lanes on the shared Accounts Hub lane shell. */}
      <div className="acc-kanban partnership-kanban bento-stagger">
        {LANES.map((lane) => {
          const items = lanes.get(lane.id) ?? [];
          return (
            <section
              key={lane.id}
              className="acc-kb-col"
              aria-label={lane.label}
            >
              <header className="acc-kb-col__head">
                <span className="acc-kb-col__title inline-flex items-center gap-1.5">
                  <lane.icon size={13} className={lane.toneClass} aria-hidden />
                  {lane.label}
                </span>
                <span className="acc-kb-col__count tabular">
                  {items.length}
                </span>
              </header>
              <div className="acc-kb-col__body">
                {items.length === 0 ? (
                  <div className="acc-kb-col__empty">{lane.empty}</div>
                ) : (
                  items.map((card) => (
                    <PartnershipCardTile
                      key={card.infId}
                      card={card}
                      lane={lane.id}
                      resending={resending === card.infId}
                      onResend={() => void resend(card)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function PartnershipCardTile({
  card,
  lane,
  resending,
  onResend,
}: {
  card: PartnershipCard;
  lane: PartnershipBucket;
  resending: boolean;
  onResend: () => void;
}) {
  const hasInfId = !card.infId.startsWith("@");
  const ads = card.adsSummary;
  return (
    <article className="bento-tile rounded-[12px] border border-border bg-bg-white p-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar
          src={card.profilePic}
          username={card.username}
          name={card.name}
          size={34}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.82rem] font-semibold text-text-primary">
            {card.name ?? card.username ?? card.infId}
          </p>
          <p className="truncate text-[0.7rem] text-text-tertiary">
            {card.username ? `@${card.username}` : "—"}
            {card.followers != null && ` · ${formatFollowers(card.followers)}`}
          </p>
        </div>
        <DeactivatedBadge isActive={card.isActive} />
      </div>

      {lane === "accepted-tested" && ads && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {ads.bestCategory && <WhCategoryBadge category={ads.bestCategory} />}
          <span className="pill pill--muted tabular text-[0.62rem]">
            {ads.tokens} in ads · {formatRupees(Math.round(ads.spend))}
          </span>
        </div>
      )}

      {lane === "send-failed" && card.errorMessage && (
        <p
          className="mt-2 rounded-[8px] bg-danger-bg px-2 py-1.5 text-[0.68rem] leading-snug text-danger-text"
          title={card.errorMessage}
        >
          {card.errorMessage.length > 120
            ? `${card.errorMessage.slice(0, 120)}…`
            : card.errorMessage}
        </p>
      )}

      <dl className="mt-2.5 space-y-1 border-t border-border-soft pt-2 text-[0.7rem]">
        {lane === "send-failed" ? (
          <div className="flex justify-between gap-2">
            <dt className="text-text-tertiary">Failed</dt>
            <dd className="tabular font-semibold text-danger">
              {fmtStamp(card.errorAt)}
            </dd>
          </div>
        ) : (
          <div className="flex justify-between gap-2">
            <dt className="text-text-tertiary">Requested</dt>
            <dd className="tabular text-text-secondary">
              {fmtStamp(card.sentAt)}
            </dd>
          </div>
        )}
        {(lane === "accepted" || lane === "accepted-tested") && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-tertiary">Accepted</dt>
            <dd className="tabular font-semibold text-success">
              {fmtStamp(card.approvedAt)}
            </dd>
          </div>
        )}
        {lane === "rejected" && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-tertiary">Rejected</dt>
            <dd className="tabular font-semibold text-danger">
              {fmtStamp(card.declinedAt)}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-text-tertiary">
            {hasInfId ? "INF ID" : "Creator"}
          </dt>
          <dd className="tabular text-text-secondary">
            {hasInfId ? card.infId : "—"}
            {card.postCount > 1 ? ` · ${card.postCount} posts` : ""}
          </dd>
        </div>
        {card.campaigns.length > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-tertiary">Campaigns</dt>
            <dd className="tabular text-text-secondary truncate">
              {card.campaigns.join(", ")}
            </dd>
          </div>
        )}
        {card.teamMembers.length > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-tertiary">Team</dt>
            <dd className="text-text-secondary truncate">
              {card.teamMembers.join(", ")}
            </dd>
          </div>
        )}
      </dl>

      {lane === "accepted-tested" && hasInfId && (
        <Link
          href={
            `/dashboard?tab=ad-status&search=${encodeURIComponent(
              card.username ?? card.infId,
            )}` as never
          }
          className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-border bg-bg-surface px-3 py-1.5 text-[0.74rem] font-semibold text-text-primary transition-colors hover:bg-bg-alt"
        >
          <Megaphone size={12} aria-hidden />
          View on Ad Status
        </Link>
      )}

      {(lane === "rejected" || lane === "send-failed") && hasInfId && (
        <button
          type="button"
          className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-border bg-bg-surface px-3 py-1.5 text-[0.74rem] font-semibold text-text-primary transition-colors hover:bg-bg-alt disabled:opacity-60"
          onClick={onResend}
          disabled={resending}
        >
          {resending ? (
            <Loader2 size={12} className="animate-spin" aria-hidden />
          ) : (
            <Send size={12} aria-hidden />
          )}
          {lane === "send-failed" ? "Retry send" : "Resend request"}
        </button>
      )}
    </article>
  );
}

function PartnershipKpi({
  tone,
  icon,
  label,
  value,
  secondary,
  info,
}: {
  tone: "accent" | "muted" | "warning" | "success" | "info" | "danger";
  icon: React.ReactNode;
  label: string;
  value: number;
  secondary: string;
  info?: string;
}) {
  return (
    <div className={cn("acc-kpi", `acc-kpi--${tone}`)}>
      <div className="acc-kpi__head">
        <span className="acc-kpi__icon" aria-hidden>
          {icon}
        </span>
        <span className="acc-kpi__label">{label}</span>
        <InfoTooltip
          title={label}
          content={
            info ??
            `${secondary}. Each creator is counted once in their latest partnership status.`
          }
        />
      </div>
      <div className="acc-kpi__primary tabular">{value}</div>
      <div className="acc-kpi__secondary tabular">{secondary}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string | undefined) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="onboarding-filter-field">
      <span>{label}</span>
      <select
        className="onboarding-filter-select"
        value={value}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

