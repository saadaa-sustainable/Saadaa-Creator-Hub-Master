"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users,
  X,
  Search,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Avatar, DeactivatedBadge } from "@/components/ui";
import { PartnershipBadge } from "@/components/ui/status-pill";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCreationModal } from "@/features/onboarding/order-form";
import {
  historicCreatorCollabSummary,
  historicCreatorFilterOptions,
  listHistoricCreators,
  type HistoricCreatorRow,
} from "./historic-creator-actions";

type CollabSummary = { count: number; ids: string[]; next: number };
type CollabSummaryMap = Record<string, CollabSummary>;

/** Strip the "SIF-N-" prefix → bare "C1, C2" labels. */
function shortCollabIds(ids: string[]): string {
  return ids
    .map((id) => {
      const m = id.match(/C\d+$/i);
      return m ? m[0].toUpperCase() : id;
    })
    .join(", ");
}

function compactFollowers(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type FilterOptions = Awaited<ReturnType<typeof historicCreatorFilterOptions>>;

const PAGE_SIZE = 60;

/**
 * "Historic Creator" trigger button + a read-only browser modal over the
 * `list_historic_creators` RPC. Lets the team scan prior creators (historic +
 * new) while filling a reach-out, with search + content-type / tier / campaign
 * / team filters and an "open IG" affordance per row.
 */
export function HistoricCreatorButton() {
  const [open, setOpen] = useState(false);

  // Filter state.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [contentType, setContentType] = useState("");
  const [tier, setTier] = useState("");
  const [campaign, setCampaign] = useState("");
  const [team, setTeam] = useState("");
  const [page, setPage] = useState(1);

  // Data state.
  const [rows, setRows] = useState<HistoricCreatorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<FilterOptions | null>(null);

  // Prior-collab summary keyed by inf_id, loaded per page of rows. Powers the
  // collab-history line + "next C{n}" hint and the Onboard affordance.
  const [summaries, setSummaries] = useState<CollabSummaryMap>({});

  // The creator currently being onboarded via the nested repeat-collab modal.
  const [onboardCreator, setOnboardCreator] =
    useState<HistoricCreatorRow | null>(null);

  // Track the latest request so a slow earlier fetch can't clobber a newer one.
  const reqRef = useRef(0);

  // Debounce the search box (~300ms) → resets to page 1.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change resets to page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, contentType, tier, campaign, team]);

  // Load filter options once on first open.
  useEffect(() => {
    if (!open || options) return;
    let cancelled = false;
    historicCreatorFilterOptions()
      .then((opts) => {
        if (!cancelled) setOptions(opts);
      })
      .catch(() => {
        // Non-fatal — filters just stay empty; the list still works.
      });
    return () => {
      cancelled = true;
    };
  }, [open, options]);

  // Fetch the list whenever the modal is open and the query changes.
  const fetchList = useCallback(() => {
    const reqId = ++reqRef.current;
    setLoading(true);
    setError(null);
    listHistoricCreators({
      search: debouncedSearch,
      contentType,
      tier,
      campaign,
      team,
      page,
    })
      .then((res) => {
        if (reqRef.current !== reqId) return;
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((e: unknown) => {
        if (reqRef.current !== reqId) return;
        setError(e instanceof Error ? e.message : "Failed to load creators");
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (reqRef.current === reqId) setLoading(false);
      });
  }, [debouncedSearch, contentType, tier, campaign, team, page]);

  useEffect(() => {
    if (!open) return;
    fetchList();
  }, [open, fetchList]);

  // Load prior-collab summaries for the visible page of rows. Keyed on the set
  // of inf_ids so it re-runs on page / filter changes. Non-fatal on error —
  // rows still render, just without the collab-history line.
  useEffect(() => {
    if (!open || rows.length === 0) {
      setSummaries({});
      return;
    }
    let cancelled = false;
    const infIds = rows.map((r) => r.inf_id);
    historicCreatorCollabSummary(infIds)
      .then((map) => {
        if (!cancelled) setSummaries(map);
      })
      .catch(() => {
        if (!cancelled) setSummaries({});
      });
    return () => {
      cancelled = true;
    };
  }, [open, rows]);

  const close = () => setOpen(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 rounded-full border border-[#E7E2D2] bg-white px-4 py-2.5 text-[0.82rem] font-bold text-[#161513] shadow-[0_1px_2px_rgba(180,150,120,0.12)] transition-all duration-200 hover:-translate-y-px hover:border-[#F0C61E] hover:shadow-[0_8px_20px_-6px_rgba(240,198,30,0.35)] active:translate-y-0"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#F0EAD6] text-[#8C5A2B] transition-colors group-hover:bg-[#F0C61E] group-hover:text-[#161513]">
          <Users className="h-3 w-3" aria-hidden />
        </span>
        Historic Creators
      </button>

      {open && (
        <div
          className={`fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px] ${
            onboardCreator ? "z-[200]" : "z-[500]"
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Historic Creators"
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            {/* Header. */}
            <div className="flex items-start justify-between gap-3 border-b border-[#E7E2D2] px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E7E2D2] bg-[#F5F1EC] text-[#6E695E]">
                  <Users size={15} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-tight text-[#161513]">
                    Historic Creators
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-[#9A9384]">
                    Browse past creators by content type, tier, campaign, or
                    team member.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="text-[#9A9384] transition-colors hover:text-[#161513]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Filter bar. */}
            <div className="border-b border-[#E7E2D2] bg-[#F5F1EC] px-5 py-3">
              <div className="flex items-center gap-2 rounded-lg border border-[#E7E2D2] bg-white px-3 py-2">
                <Search size={14} className="shrink-0 text-[#9A9384]" aria-hidden />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or @username…"
                  className="w-full bg-transparent text-sm text-[#161513] outline-none placeholder:text-[#9A9384]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-[11px] font-semibold text-[#9A9384] hover:text-[#161513]"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <SearchableSelect
                  options={options?.contentTypes ?? []}
                  value={contentType}
                  onChange={setContentType}
                  placeholder="All content types"
                  searchPlaceholder="Search content types…"
                  clearable
                />
                <SearchableSelect
                  options={(options?.tiers ?? []).map((t) => ({
                    value: t,
                    label: t,
                  }))}
                  value={tier}
                  onChange={setTier}
                  placeholder="All tiers"
                  searchPlaceholder="Search tiers…"
                  clearable
                />
                <SearchableSelect
                  options={options?.campaigns ?? []}
                  value={campaign}
                  onChange={setCampaign}
                  placeholder="All campaigns"
                  searchPlaceholder="Search campaigns…"
                  clearable
                />
                <SearchableSelect
                  options={(options?.teamMembers ?? []).map((m) => ({
                    value: m,
                    label: m,
                  }))}
                  value={team}
                  onChange={setTeam}
                  placeholder="All team members"
                  searchPlaceholder="Search team…"
                  clearable
                />
              </div>
            </div>

            {/* List. */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-40 items-center justify-center text-[#9A9384]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                </div>
              ) : error ? (
                <div className="px-5 py-10 text-center text-[13px] text-[#C0392B]">
                  {error}
                </div>
              ) : rows.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-[#9A9384]">
                  No creators match these filters.
                </div>
              ) : (
                <ul className="divide-y divide-[#E7E2D2]">
                  {rows.map((c) => {
                    const isHistoric = c.creator_type === "historic_creator";
                    const summary = summaries[c.inf_id];
                    return (
                      <li
                        key={`${c.inf_id}-${c.username}`}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <Avatar
                          src={c.profile_pic}
                          username={c.username}
                          name={c.inf_name}
                          size={36}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[0.85rem] font-semibold text-[#161513]">
                              {c.inf_name ?? c.username}
                            </span>
                            <span className="shrink-0 rounded-full bg-[#F5F1EC] px-1.5 py-0.5 text-[0.56rem] font-bold tracking-wide text-[#6E695E]">
                              {c.inf_id}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[0.7rem] text-[#9A9384]">
                            <a
                              href={`https://www.instagram.com/${c.username}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-[#161513] hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              @{c.username}
                            </a>
                            {c.category ? ` · ${c.category}` : ""}
                          </div>
                          {summary && (
                            <div className="mt-0.5 truncate text-[0.66rem] text-[#9A9384]">
                              {summary.count > 0 ? (
                                <span className="text-[#6E695E]">
                                  ↻ {summary.count} collab
                                  {summary.count === 1 ? "" : "s"} ·{" "}
                                  {shortCollabIds(summary.ids)} · next C
                                  {summary.next}
                                </span>
                              ) : summary.next === 2 ? (
                                <span className="text-[#6E695E]">
                                  ↻ Reached out before · next C2
                                </span>
                              ) : (
                                <span>First collab</span>
                              )}
                            </div>
                          )}
                        </div>
                        {c.is_active === false && (
                          <DeactivatedBadge isActive={c.is_active} />
                        )}
                        <PartnershipBadge
                          status={c.partnership_status}
                          compact
                          className="shrink-0"
                        />
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${
                            isHistoric
                              ? "bg-[#F0EAD6] text-[#8C5A2B]"
                              : "bg-[#ECF1E9] text-[#4F7C4D]"
                          }`}
                        >
                          {isHistoric ? "Historic" : "New"}
                        </span>
                        <a
                          href={`https://www.instagram.com/${c.username}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-[#9A9384] transition-colors hover:text-[#161513]"
                          aria-label={`Open @${c.username} on Instagram`}
                          title="Open on Instagram"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={13} />
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOnboardCreator(c);
                          }}
                          className="group/onb inline-flex shrink-0 items-center gap-1 rounded-full border border-[#E7E2D2] bg-white px-2.5 py-1 text-[0.66rem] font-bold text-[#161513] transition-colors hover:border-[#F0C61E] hover:bg-[#F0C61E]"
                          title={`Onboard a new collab for ${c.inf_name ?? c.username}`}
                          aria-label={`Onboard ${c.inf_name ?? c.username}`}
                        >
                          <Plus size={11} aria-hidden />
                          Onboard
                        </button>
                        <div className="w-16 shrink-0 text-right text-[0.9rem] font-bold tabular text-[#161513]">
                          {compactFollowers(c.followers)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer — count + Prev/Next pagination. */}
            <div className="flex items-center justify-between gap-3 border-t border-[#E7E2D2] px-5 py-3">
              <span className="text-[12px] text-[#6E695E]">
                {total === 0
                  ? "0 creators"
                  : `${rangeStart}–${rangeEnd} of ${total} creator${total === 1 ? "" : "s"}`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={loading || page <= 1}
                  className="inline-flex items-center gap-1 rounded-[8px] border border-[#E7E2D2] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#6E695E] transition-colors hover:bg-[#F5F1EC] disabled:opacity-40"
                >
                  <ChevronLeft size={13} />
                  Prev
                </button>
                <span className="px-1 text-[12px] tabular text-[#9A9384]">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={loading || page >= totalPages}
                  className="inline-flex items-center gap-1 rounded-[8px] border border-[#E7E2D2] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#6E695E] transition-colors hover:bg-[#F5F1EC] disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {onboardCreator && (
        <OrderCreationModal
          repeatMode
          open
          lockCreatorInfId={onboardCreator.inf_id}
          lockCreatorLabel={onboardCreator.inf_name ?? onboardCreator.username}
          creatorName={onboardCreator.inf_name ?? null}
          username={onboardCreator.username}
          postId=""
          onClose={() => setOnboardCreator(null)}
        />
      )}
    </>
  );
}
