"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Layers,
  Loader2,
  Search,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import { bulkAssignPostsToCampaign } from "./bulk-assign-actions";
import type {
  AssignableCampaign,
  UnassignedReachOut,
} from "./bulk-assign-queries";

export function BulkAssignCampaignPanel({
  rows,
  campaigns,
}: {
  rows: UnassignedReachOut[];
  campaigns: AssignableCampaign[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(rows.length > 0 && rows.length <= 60);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [campaignId, setCampaignId] = useState("");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        (r.username ?? "").toLowerCase().includes(needle) ||
        (r.inf_id ?? "").toLowerCase().includes(needle) ||
        (r.logged_by ?? "").toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });

  const assign = () => {
    if (!campaignId) {
      toast.error("Pick a campaign first.");
      return;
    }
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Select at least one reach-out row.");
      return;
    }
    start(async () => {
      const res = await bulkAssignPostsToCampaign(ids, campaignId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <section className="rounded-[14px] border border-border bg-bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "#F3EDFB", color: "#7B4FBF" }}
        >
          <Layers size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[0.9rem] font-bold text-text-primary">
            Assign unassigned reach-outs to a campaign
          </h3>
          <p className="mt-0.5 text-[0.72rem] text-text-tertiary">
            Reach-out rows with no campaign yet — select and bulk-attach to an
            existing campaign.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-bg-surface px-2.5 py-1 text-[0.72rem] font-semibold tabular text-text-secondary">
          {rows.length} unassigned
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-border-soft px-4 pb-4 pt-3">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-[0.82rem] text-text-tertiary">
              Every reach-out is tied to a campaign. Nothing to assign.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
                    aria-hidden
                  />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Filter by handle, SIF, or callout-by"
                    className="w-full rounded-[10px] border border-border bg-bg-white py-1.5 pl-8 pr-3 text-[0.78rem] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/25"
                  />
                </div>
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="rounded-[10px] border border-border bg-bg-white px-2.5 py-1.5 text-[0.78rem] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/25"
                >
                  <option value="">Choose campaign…</option>
                  {campaigns.map((c) => (
                    <option key={c.campaign_id} value={c.campaign_id}>
                      {c.campaign_id}
                      {c.campaign_name ? ` · ${c.campaign_name}` : ""}
                      {c.status && !/active/i.test(c.status)
                        ? ` (${c.status})`
                        : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={assign}
                  disabled={pending || selected.size === 0 || !campaignId}
                  className="btn-primary-cta disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Tag size={13} />
                  )}
                  Assign {selected.size > 0 ? selected.size : ""}
                </button>
              </div>

              <div className="mt-3 max-h-[420px] overflow-auto rounded-[10px] border border-border">
                <table className="w-full border-collapse text-[0.76rem]">
                  <thead className="sticky top-0 z-10 bg-bg-surface">
                    <tr className="text-left text-text-secondary">
                      <th className="w-9 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          aria-label="Select all visible"
                          className="h-3.5 w-3.5 accent-accent"
                        />
                      </th>
                      <th className="px-2 py-2 font-semibold">Creator</th>
                      <th className="px-2 py-2 font-semibold">Date</th>
                      <th className="px-2 py-2 font-semibold">Dir</th>
                      <th className="px-2 py-2 font-semibold">Content</th>
                      <th className="px-2 py-2 font-semibold">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const checked = selected.has(r.id);
                      const inbound = (r.reachout_direction ?? "")
                        .toLowerCase()
                        .startsWith("in");
                      return (
                        <tr
                          key={r.id}
                          onClick={() => toggle(r.id)}
                          className={`cursor-pointer border-t border-border-soft transition-colors ${
                            checked ? "bg-accent/10" : "hover:bg-bg-surface/60"
                          }`}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(r.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Select ${r.username ?? r.inf_id}`}
                              className="h-3.5 w-3.5 accent-accent"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="font-semibold text-text-primary">
                              {r.username ?? "—"}
                            </div>
                            <div className="font-mono text-[0.66rem] text-text-tertiary">
                              {r.inf_id ?? "—"}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 tabular text-text-secondary">
                            {formatDate(r.reach_out_date)}
                          </td>
                          <td className="px-2 py-1.5">
                            <span
                              className="inline-flex items-center gap-1 text-[0.7rem] font-medium"
                              style={{ color: inbound ? "#4F7C4D" : "#3B6FD4" }}
                            >
                              {inbound ? (
                                <ArrowDownLeft size={11} aria-hidden />
                              ) : (
                                <ArrowUpRight size={11} aria-hidden />
                              )}
                              {inbound ? "In" : "Out"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-text-secondary">
                            {r.content_type ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-text-secondary">
                            {r.logged_by ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-2 py-6 text-center text-text-tertiary"
                        >
                          No rows match &ldquo;{q}&rdquo;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-[0.7rem] text-text-tertiary">
                {selected.size} selected · showing {filtered.length} of{" "}
                {rows.length}. Only unassigned rows move; a row already on a
                campaign is never reassigned.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
