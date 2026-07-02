"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Handshake,
  Loader2,
  RefreshCcw,
  Search,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { CountUp } from "@/components/ui/count-up";
import { DeactivatedBadge } from "@/components/ui/status-pill";
import { formatFollowers } from "@/lib/formatters";
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
 * Partnership Status board — 3-lane kanban over per-creator Meta
 * branded-content permission states.
 *
 * "Real-time": on mount every REQUESTED (pending) creator is re-checked
 * against the live Meta API (staggered, capped) so accepts / rejects that
 * happened since the last visit surface immediately — the server action also
 * stamps approved_at / declined_at in the DB. The Refresh button re-runs the
 * same sweep on demand. Rejected cards carry Resend (posting_submit gate).
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
    id: "accepted",
    label: "Accepted",
    icon: CheckCircle2,
    toneClass: "text-success",
    empty: "No accepted partnerships yet.",
  },
  {
    id: "rejected",
    label: "Rejected",
    icon: XCircle,
    toneClass: "text-danger",
    empty: "No rejected requests. Good sign.",
  },
];

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
                        res.state === "approved" ? "accepted" : "rejected",
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
      toast.success(`Partnership request resent to @${card.username ?? card.infId}.`);
      const nowIso = new Date().toISOString();
      setCards((prev) =>
        prev.map((c) =>
          c.infId === card.infId
            ? { ...c, state: "pending", bucket: "requested", sentAt: nowIso }
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

  const kpi = {
    requested: lanes.get("requested")?.length ?? 0,
    accepted: lanes.get("accepted")?.length ?? 0,
    rejected: lanes.get("rejected")?.length ?? 0,
    total: cards.length,
  };

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
          <label className="onboarding-filter-field">
            <span>Campaign</span>
            <select
              className="onboarding-filter-select"
              value={initialFilters.campaign ?? ""}
              onChange={(e) => setParam("campaign", e.target.value || undefined)}
            >
              <option value="">All campaigns</option>
              {data.campaignOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="onboarding-filter-field">
            <span>Requested from</span>
            <input
              type="date"
              className="onboarding-filter-select"
              value={initialFilters.sentFrom ?? ""}
              onChange={(e) => setParam("sentFrom", e.target.value || undefined)}
            />
          </label>
          <label className="onboarding-filter-field">
            <span>Requested to</span>
            <input
              type="date"
              className="onboarding-filter-select"
              value={initialFilters.sentTo ?? ""}
              onChange={(e) => setParam("sentTo", e.target.value || undefined)}
            />
          </label>
          <div className="onboarding-filter-field justify-end">
            <span aria-hidden>&nbsp;</span>
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

      {/* KPI strip — one tile per lane (a "total" tile just restated their sum). */}
      <div className="bento-stagger grid grid-cols-3 gap-3">
        <PartnershipKpi
          icon={Clock3}
          label="Requested"
          value={kpi.requested}
          className="text-warning"
        />
        <PartnershipKpi
          icon={CheckCircle2}
          label="Accepted"
          value={kpi.accepted}
          className="text-success"
        />
        <PartnershipKpi
          icon={XCircle}
          label="Rejected"
          value={kpi.rejected}
          className="text-danger"
        />
      </div>

      {/* Kanban — reuses the Accounts Hub lane shell for visual consistency. */}
      <div className="acc-kanban bento-stagger">
        {LANES.map((lane) => {
          const items = lanes.get(lane.id) ?? [];
          return (
            <section key={lane.id} className="acc-kb-col" aria-label={lane.label}>
              <header className="acc-kb-col__head">
                <span className="acc-kb-col__title inline-flex items-center gap-1.5">
                  <lane.icon size={13} className={lane.toneClass} aria-hidden />
                  {lane.label}
                </span>
                <span className="acc-kb-col__count tabular">{items.length}</span>
              </header>
              <div className="acc-kb-col__body">
                {items.length === 0 ? (
                  <div className="acc-kb-col__empty">{lane.empty}</div>
                ) : (
                  items.map((card) => (
                    <article
                      key={card.infId}
                      className="bento-tile rounded-[12px] border border-border bg-bg-white p-3"
                    >
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
                            {card.followers != null &&
                              ` · ${formatFollowers(card.followers)}`}
                          </p>
                        </div>
                        <DeactivatedBadge isActive={card.isActive} />
                      </div>

                      <dl className="mt-2.5 space-y-1 border-t border-border-soft pt-2 text-[0.7rem]">
                        <div className="flex justify-between gap-2">
                          <dt className="text-text-tertiary">Requested</dt>
                          <dd className="tabular text-text-secondary">
                            {fmtStamp(card.sentAt)}
                          </dd>
                        </div>
                        {lane.id === "accepted" && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-text-tertiary">Accepted</dt>
                            <dd className="tabular font-semibold text-success">
                              {fmtStamp(card.approvedAt)}
                            </dd>
                          </div>
                        )}
                        {lane.id === "rejected" && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-text-tertiary">Rejected</dt>
                            <dd className="tabular font-semibold text-danger">
                              {fmtStamp(card.declinedAt)}
                            </dd>
                          </div>
                        )}
                        <div className="flex justify-between gap-2">
                          <dt className="text-text-tertiary">
                            {card.infId.startsWith("@") ? "Creator" : "INF ID"}
                          </dt>
                          <dd className="tabular text-text-secondary">
                            {card.infId.startsWith("@") ? "—" : card.infId}
                            {card.postCount > 1 ? ` · ${card.postCount} posts` : ""}
                          </dd>
                        </div>
                      </dl>

                      {lane.id === "rejected" && !card.infId.startsWith("@") && (
                        <button
                          type="button"
                          className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-border bg-bg-surface px-3 py-1.5 text-[0.74rem] font-semibold text-text-primary transition-colors hover:bg-bg-alt disabled:opacity-60"
                          onClick={() => void resend(card)}
                          disabled={resending === card.infId}
                        >
                          {resending === card.infId ? (
                            <Loader2 size={12} className="animate-spin" aria-hidden />
                          ) : (
                            <Send size={12} aria-hidden />
                          )}
                          Resend request
                        </button>
                      )}
                    </article>
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

function PartnershipKpi({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof Handshake;
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="bento-tile flex items-center gap-3 rounded-[12px] border border-border bg-bg-white px-3.5 py-3">
      <span
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg-muted",
          className ?? "text-text-secondary",
        )}
      >
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[1.05rem] font-bold leading-tight tabular text-text-primary">
          <CountUp value={value} />
        </p>
        <p className="truncate text-[0.68rem] text-text-secondary">{label}</p>
      </div>
    </div>
  );
}
