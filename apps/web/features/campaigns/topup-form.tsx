"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Coins,
  Gauge,
  IndianRupee,
  Loader2,
  Lock,
  Plus,
  PlusCircle,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getTopUpContext, submitBudgetTopUp } from "@/features/budget/actions";
import { VersionExplainer } from "@/features/budget/version-chip";
import {
  COLLAB_TYPES,
  INFLUENCER_TIERS,
  computeRowCompTotal,
  computeRowEstGarment,
  computeRowTotal,
  computeTotals,
  makeBudgetRow,
  type BudgetRowInput,
} from "./schema";
import type { CampaignListRow } from "./queries";

function fmtINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/**
 * New Campaign → "Add budget (existing campaign)". Everything about the
 * campaign is auto-filled and LOCKED — the team enters only the creators, the
 * budget lines, and a mandatory reason for the increase. Submitting mints the
 * campaign's next budget version as a pending top-up for Global Admins.
 */
export function BudgetTopUpForm({ campaigns }: { campaigns: CampaignListRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const liveCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) => (c.status ?? "").toLowerCase() === "active",
      ),
    [campaigns],
  );

  const [campaignId, setCampaignId] = useState("");
  const [reason, setReason] = useState("");
  const [numCreators, setNumCreators] = useState("");
  const [rows, setRows] = useState<BudgetRowInput[]>([]);
  const [ctx, setCtx] = useState<{
    nextVersion: number;
    monthLabel: string;
    allocated: number;
    utilized: number;
    remaining: number;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selected = liveCampaigns.find((c) => c.campaign_id === campaignId);
  const totals = computeTotals(rows);

  // Live disclaimer context — which V-number this submit will mint.
  useEffect(() => {
    let alive = true;
    setCtx(null);
    if (!campaignId) return;
    getTopUpContext(campaignId).then((res) => {
      if (alive && res.ok && res.nextVersion != null)
        setCtx({
          nextVersion: res.nextVersion,
          monthLabel: res.monthLabel ?? "",
          allocated: res.allocated ?? 0,
          utilized: res.utilized ?? 0,
          remaining: res.remaining ?? 0,
        });
    });
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const setRow = (idx: number, patch: Partial<BudgetRowInput>) =>
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              ...patch,
              ...(patch.collabType === "Barter" ? { avgComp: 0 } : {}),
            }
          : r,
      ),
    );

  const submit = () =>
    start(async () => {
      setFieldErrors({});
      const res = await submitBudgetTopUp({
        campaignId,
        reason,
        numCreators,
        budgetRows: rows,
      });
      if (!res.ok) {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "Could not submit the top-up.");
        return;
      }
      toast.success(
        `Budget V${res.versionNumber} (${fmtINR(res.amount ?? 0)}) submitted — pending Global Admin approval.`,
      );
      setCampaignId("");
      setReason("");
      setNumCreators("");
      setRows([]);
      router.refresh();
    });

  return (
    <div className="campaign-form space-y-4">
      {/* 01 · Pick the campaign */}
      <div className="glass-card campaign-section-card">
        <h5 className="section-title mb-1">
          <PlusCircle size={14} className="inline mr-2" />
          Existing Campaign <span className="req">*</span>
        </h5>
        <small className="text-muted block mb-3">
          Adds a new <strong>budget version</strong> to a live campaign — the
          campaign itself is never duplicated or edited.
        </small>
        <div className="max-w-md">
          <SearchableSelect
            value={campaignId}
            onChange={(v) => setCampaignId(v)}
            options={liveCampaigns.map((c) => ({
              value: c.campaign_id,
              label: `${c.campaign_id} — ${c.campaign_name ?? ""}`,
            }))}
            placeholder="Select campaign…"
            searchPlaceholder="Search campaigns…"
          />
        </div>
        {fieldErrors.campaignId && (
          <small className="field-error">{fieldErrors.campaignId}</small>
        )}

        {selected && ctx && (
          <div
            className="mt-3 rounded-[10px] border px-3.5 py-2.5 text-[0.8rem]"
            style={{
              background: "var(--color-success-bg, #ECF1E9)",
              borderColor: "rgba(79, 124, 77, 0.3)",
              color: "var(--color-success-text, #4F7C4D)",
            }}
            role="note"
          >
            <strong>{selected.campaign_id}</strong> still has{" "}
            <strong>{fmtINR(ctx.remaining)}</strong> left for {ctx.monthLabel}{" "}
            (allocated {fmtINR(ctx.allocated)} · utilized{" "}
            {fmtINR(ctx.utilized)}). Add more only if that won&apos;t cover the
            plan.
          </div>
        )}

        {selected && (
          <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            <LockedField label="Campaign Name" value={selected.campaign_name} />
            <LockedField label="Key Message" value={selected.key_message} />
            <LockedField
              label="Start — End"
              value={
                selected.start_date || selected.end_date
                  ? `${selected.start_date ?? "—"} → ${selected.end_date ?? "—"}`
                  : null
              }
            />
            <LockedField label="Link to Brief" value={selected.brief_link} />
            <LockedField
              label="Internal Brief"
              value={selected.internal_brief_link}
            />
            <LockedField
              label="Current No. of Creators"
              value={String(selected.no_of_creators ?? "—")}
            />
          </div>
        )}
      </div>

      {selected && (
        <>
          {/* 02 · What the team enters */}
          <div className="glass-card campaign-section-card">
            <h5 className="section-title mb-1">
              <Coins size={14} className="inline mr-2" />
              New Budget <span className="req">*</span>
            </h5>
            <small className="text-muted block mb-3">
              Only these fields are yours — everything else came from the
              campaign.
            </small>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] mb-3">
              <div className="form-floating">
                <input
                  id="topup_creators"
                  type="number"
                  min={1}
                  className="form-control"
                  placeholder=" "
                  value={numCreators}
                  onChange={(e) =>
                    setNumCreators(e.target.value.replace(/\D/g, ""))
                  }
                />
                <label htmlFor="topup_creators">
                  Additional No. of Creators <span className="req">*</span>
                </label>
                {fieldErrors.numCreators && (
                  <small className="field-error">{fieldErrors.numCreators}</small>
                )}
              </div>
            </div>

            <div className="form-floating mb-3">
              <textarea
                id="topup_reason"
                className="form-control"
                style={{ minHeight: 74 }}
                placeholder=" "
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <label htmlFor="topup_reason">
                Reason for the budget increase <span className="req">*</span>
              </label>
              {fieldErrors.reason && (
                <small className="field-error">{fieldErrors.reason}</small>
              )}
              <small className="text-muted">
                Shown to the Global Admins on the Budget tab and in Approvals —
                say why the campaign needs more money.
              </small>
            </div>

            <div className="campaign-budget-head">
              <div className="campaign-budget-head__copy">
                <h5 className="section-title mb-1">Budget Lines</h5>
              </div>
              <button
                type="button"
                className="btn btn-accent btn-sm campaign-add-line"
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    makeBudgetRow({
                      campaignName: selected.campaign_name ?? "",
                    }),
                  ])
                }
              >
                <Plus size={12} />
                Add Line
              </button>
            </div>

            <div className="campaign-budget-summary" aria-label="Budget summary">
              <div>
                <span>
                  <Users size={12} />
                  Allocated
                </span>
                <strong>{totals.allocated}</strong>
              </div>
              <div>
                <span>
                  <IndianRupee size={12} />
                  Compensation
                </span>
                <strong>{fmtINR(totals.totalComp)}</strong>
              </div>
              <div>
                <span>
                  <Gauge size={12} />
                  Total
                </span>
                <strong>{fmtINR(totals.totalAll)}</strong>
              </div>
            </div>

            <div className="budget-wrap">
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Collab</th>
                    <th style={{ textAlign: "center" }}>No.</th>
                    <th style={{ textAlign: "right" }}>Avg Comp ₹</th>
                    <th style={{ textAlign: "right" }}>Comp Total</th>
                    <th style={{ textAlign: "center" }}>Max G</th>
                    <th style={{ textAlign: "right" }}>Garm Cost</th>
                    <th style={{ textAlign: "right" }}>Total ₹</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-row">
                        No lines yet — press Add Line.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, idx) => {
                      const isBarter = r.collabType === "Barter";
                      return (
                        <tr key={idx}>
                          <td style={{ minWidth: 150 }}>
                            <SearchableSelect
                              value={r.tier}
                              onChange={(v) =>
                                setRow(idx, {
                                  tier: v as BudgetRowInput["tier"],
                                })
                              }
                              options={INFLUENCER_TIERS.map((t) => ({
                                value: t,
                                label: t,
                              }))}
                              searchPlaceholder="Search tiers…"
                            />
                          </td>
                          <td style={{ minWidth: 110 }}>
                            <SearchableSelect
                              value={r.collabType}
                              onChange={(v) =>
                                setRow(idx, {
                                  collabType: v as BudgetRowInput["collabType"],
                                })
                              }
                              options={COLLAB_TYPES.map((c) => ({
                                value: c,
                                label: c,
                              }))}
                              searchPlaceholder="Search…"
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min={0}
                              className="form-control br-num"
                              value={r.numInfluencers || ""}
                              onChange={(e) =>
                                setRow(idx, {
                                  numInfluencers: Number(
                                    e.target.value.replace(/\D/g, "") || 0,
                                  ),
                                })
                              }
                            />
                          </td>
                          <td className="right">
                            <input
                              type="number"
                              min={0}
                              readOnly={isBarter}
                              tabIndex={isBarter ? -1 : 0}
                              title={
                                isBarter
                                  ? "Barter collabs have no cash compensation."
                                  : undefined
                              }
                              className={cn(
                                "form-control br-avg",
                                isBarter && "br-readonly",
                              )}
                              value={isBarter ? 0 : r.avgComp || ""}
                              onChange={(e) =>
                                setRow(idx, {
                                  avgComp: Number(e.target.value || 0),
                                })
                              }
                            />
                          </td>
                          <td className="right tabular-nums">
                            {fmtINR(computeRowCompTotal(r))}
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min={1}
                              className="form-control br-maxgar"
                              value={r.maxGarments || ""}
                              onChange={(e) =>
                                setRow(idx, {
                                  maxGarments: Number(
                                    e.target.value.replace(/\D/g, "") || 1,
                                  ),
                                })
                              }
                            />
                          </td>
                          <td className="right tabular-nums">
                            {fmtINR(computeRowEstGarment(r))}
                          </td>
                          <td className="right tabular-nums font-bold">
                            {fmtINR(computeRowTotal(r))}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-row-remove"
                              aria-label="Remove line"
                              onClick={() =>
                                setRows((prev) =>
                                  prev.filter((_, i) => i !== idx),
                                )
                              }
                            >
                              <X size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {fieldErrors.budgetRows && (
              <small className="field-error">{fieldErrors.budgetRows}</small>
            )}
          </div>

          {/* Disclaimer — which version this will create */}
          <div
            className="rounded-xl border px-4 py-3 text-[0.82rem]"
            style={{
              background: "var(--color-warning-bg, #FAF1DC)",
              borderColor: "rgba(181, 117, 20, 0.35)",
              color: "#6b4a10",
            }}
            role="note"
          >
            <AlertTriangle
              size={13}
              aria-hidden
              className="inline mr-1.5 -mt-0.5 text-warning"
            />
            This adds a <strong>new budget version</strong> to{" "}
            <strong>{selected.campaign_id}</strong>
            {ctx ? (
              <>
                {" "}
                — it will be created as <strong>V{ctx.nextVersion}</strong> (the
                next number in this campaign&apos;s chain) for{" "}
                <strong>{ctx.monthLabel}</strong>
              </>
            ) : null}
            . It needs <strong>Global Admin approval</strong> before the money
            is usable, and the creator cap raises only after approval. The
            campaign itself is not duplicated.
          </div>

          <VersionExplainer compact />

          <button
            type="button"
            disabled={pending || !campaignId}
            onClick={submit}
            className="btn-primary-cta w-full justify-center"
          >
            {pending ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Lock size={14} aria-hidden />
            )}
            Submit budget for approval
          </button>
        </>
      )}
    </div>
  );
}

function LockedField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-bg-surface px-3 py-2">
      <span className="flex items-center gap-1 text-[0.58rem] font-extrabold uppercase tracking-[0.08em] text-text-tertiary">
        <Lock size={9} aria-hidden /> {label}
      </span>
      <div
        className="truncate text-[0.8rem] font-semibold text-text-secondary"
        title={value ?? undefined}
      >
        {value || "—"}
      </div>
    </div>
  );
}
