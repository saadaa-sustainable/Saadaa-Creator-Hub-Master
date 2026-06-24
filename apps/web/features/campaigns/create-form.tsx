"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  PlusCircle,
  Coins,
  Plus,
  X,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Gauge,
  IndianRupee,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { MissingFieldsAlert } from "@/components/ui/missing-fields-alert";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { submitCampaign, editCampaign } from "./actions";
import {
  CampaignCreateSchema,
  CAMPAIGN_DEFAULTS,
  INFLUENCER_TIERS,
  COLLAB_TYPES,
  MIN_GARMENTS_FIXED,
  computeTotals,
  computeRowEstGarment,
  computeRowCompTotal,
  computeRowTotal,
  makeBudgetRow,
  type CampaignCreateInput,
} from "./schema";

/** Indian-locale currency formatter — matches legacy toLocaleString('en-IN'). */
function fmtINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function decimalOnly(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...parts] = cleaned.split(".");
  return parts.length ? `${whole}.${parts.join("")}` : whole;
}

function blockNonNumericChromeKeys(event: KeyboardEvent<HTMLInputElement>) {
  if (["e", "E", "+", "-"].includes(event.key)) {
    event.preventDefault();
  }
}

type CapState = "none" | "under" | "at" | "over";

export interface CampaignCreateFormProps {
  /** "create" (default) submits via submitCampaign; "edit" via editCampaign. */
  mode?: "create" | "edit";
  /** Pre-fill values when editing an existing campaign. */
  initial?: CampaignCreateInput;
  /** Required in edit mode — the IFC{NNN} of the campaign being edited. */
  campaignId?: string;
  /** Called after a successful edit (e.g. close the modal + refresh). */
  onEdited?: () => void;
}

export function CampaignCreateForm({
  mode = "create",
  initial,
  campaignId,
  onEdited,
}: CampaignCreateFormProps = {}) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [submitting, startSubmit] = useTransition();
  const [lastCampNameForSegment, setLastCampNameForSegment] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // In edit mode, rows are prefilled — suppress the auto-seed effect.
  const seededRef = useRef(isEdit);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CampaignCreateInput>({
    resolver: zodResolver(CampaignCreateSchema),
    defaultValues: initial ?? CAMPAIGN_DEFAULTS,
    mode: "onBlur",
    criteriaMode: "all",
    reValidateMode: "onChange",
    shouldFocusError: true,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "budgetRows",
  });

  const watched = watch();
  const rows = watched.budgetRows ?? [];
  const campName = watched.campaignName ?? "";
  const cap = parseInt(watched.numCreators ?? "", 10);
  const hasCap = !isNaN(cap) && cap > 0;
  const totals = computeTotals(rows);

  // ── Cap allocation strip state ────────────────────────────────────────
  let capState: CapState = "none";
  if (hasCap) {
    if (totals.allocated > cap) capState = "over";
    else if (totals.allocated === cap) capState = "at";
    else capState = "under";
  }

  // ── Effect: seed 2 default rows on first numCreators entry (legacy) ────
  // Skipped in edit mode — rows arrive prefilled from the existing campaign.
  useEffect(() => {
    if (isEdit) return;
    if (hasCap && rows.length === 0 && !seededRef.current) {
      seededRef.current = true;
      append(makeBudgetRow({ collabType: "Barter", campaignName: campName }));
      append(makeBudgetRow({ collabType: "Paid", campaignName: campName }));
    }
    if (!hasCap) seededRef.current = false;
  }, [isEdit, hasCap, rows.length, campName, append]);

  // ── Effect: sync segment col with Campaign Name (legacy) ──────────────
  useEffect(() => {
    rows.forEach((r, idx) => {
      const v = (r.campaignName ?? "").trim();
      if (!v || v === lastCampNameForSegment) {
        setValue(`budgetRows.${idx}.campaignName`, campName, {
          shouldDirty: false,
        });
      }
    });
    setLastCampNameForSegment(campName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campName]);

  // ── Effect: Barter avg lock to 0 (legacy _applyBarterAvgLock) ─────────
  useEffect(() => {
    rows.forEach((r, idx) => {
      if (r.collabType === "Barter" && (r.avgComp ?? 0) !== 0) {
        setValue(`budgetRows.${idx}.avgComp`, 0, { shouldDirty: false });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rows.map((r) => r.collabType))]);

  const handleAddRow = () => {
    append(makeBudgetRow({ campaignName: campName }));
  };

  const onSubmit = (values: CampaignCreateInput) => {
    startSubmit(async () => {
      if (isEdit) {
        if (!campaignId) {
          toast.error("Missing campaign ID for edit.");
          return;
        }
        const res = await editCampaign(campaignId, values);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(res.message);
        if (res.warning) toast.warning(res.warning);
        router.refresh();
        onEdited?.();
        return;
      }
      const res = await submitCampaign(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.push(
        `/reach-out/outbound?campaign=${encodeURIComponent(res.campaignId)}`,
      );
      router.refresh();
    });
  };

  // ── Cap strip rendering ───────────────────────────────────────────────
  const capStrip = (() => {
    if (capState === "none") {
      return (
        <div className="cap-strip cap-strip--idle">
          <span>
            Set <strong>No. of Creators</strong> above to enable cap tracking.
          </span>
        </div>
      );
    }
    const remaining = cap - totals.allocated;
    if (capState === "over") {
      return (
        <div className="cap-strip cap-strip--danger">
          <span>
            <strong>{totals.allocated}</strong>
            <span className="text-text-tertiary"> / {cap}</span>
            <span className="ml-2 text-danger font-semibold">
              Over by {totals.allocated - cap}
            </span>
          </span>
          <span className="cap-pill cap-pill--danger">
            <AlertTriangle size={12} /> Over Cap
          </span>
        </div>
      );
    }
    if (capState === "at") {
      return (
        <div className="cap-strip cap-strip--success">
          <span>
            <strong>{totals.allocated}</strong>
            <span className="text-text-tertiary"> / {cap}</span>
            <span className="ml-2 text-success font-semibold">Cap reached</span>
          </span>
          <span className="cap-pill cap-pill--success">
            <CheckCircle2 size={12} /> Full
          </span>
        </div>
      );
    }
    return (
      <div className="cap-strip cap-strip--idle">
        <span>
          <strong>{totals.allocated}</strong>
          <span className="text-text-tertiary"> / {cap}</span>
          <span className="ml-2 text-text-secondary">
            {remaining} remaining
          </span>
        </span>
        <span className="cap-pill">{remaining} Left</span>
      </div>
    );
  })();

  const CAMPAIGN_FIELD_LABELS: Record<string, string> = {
    campaignName: "Campaign Name",
    keyMessage: "Key Message",
    startDate: "Start Date",
    endDate: "End Date",
    numCreators: "Number of Creators",
    briefLink: "Brief Link",
    budgetRows: "Budget Rows",
  };
  const allCampaignValues = watch();
  const campaignMissingFields = useMemo<string[]>(() => {
    if (!submitAttempted) return [];
    const parsed = CampaignCreateSchema.safeParse(allCampaignValues);
    if (parsed.success) return [];
    const keys = new Set<string>();
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "");
      if (k) keys.add(k);
    }
    return Array.from(keys)
      .map((k) => CAMPAIGN_FIELD_LABELS[k])
      .filter((v): v is string => Boolean(v));
  }, [submitAttempted, allCampaignValues]);

  const creatorsHelper = (() => {
    if (capState === "none")
      return "Set a target. Two budget lines (Barter + Paid) seed automatically. Adjust or delete to make the campaign fully one type.";
    if (capState === "over")
      return `${totals.allocated} of ${cap} allocated. Reduce ${totals.allocated - cap}.`;
    if (capState === "at")
      return `${totals.allocated} of ${cap} allocated. Cap reached.`;
    return `${totals.allocated} of ${cap} allocated. ${cap - totals.allocated} remaining.`;
  })();

  return (
    <form
      id="campaignForm"
      onSubmit={(e) => {
        setSubmitAttempted(true);
        handleSubmit(onSubmit)(e);
      }}
      className="campaign-form space-y-4"
    >
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div className="page-header campaign-form-header">
        <span className="header-icon campaign-form-header__icon">
          <PlusCircle size={17} />
        </span>
        <div className="campaign-form-header__copy">
          <h1>{isEdit ? `Edit Campaign ${campaignId ?? ""}`.trim() : "Create Campaign"}</h1>
          <p>
            {isEdit
              ? "Update details, creator count, and budget. Existing reach-out commercials are unchanged."
              : "Campaign details, cap, and tracker budget in one pass."}
          </p>
        </div>
      </div>

      {/* ── Campaign Details ──────────────────────────────────────────── */}
      <div className="glass-card campaign-section-card">
        <h5 className="section-title mb-4">
          <PlusCircle size={14} className="inline mr-2" />
          Campaign Details
        </h5>

        <div className="form-grid">
          {/* Campaign Name — full width (long input) */}
          <div className="form-floating form-grid-full">
            <input
              type="text"
              className="form-control"
              id="camp_name"
              placeholder=" "
              {...register("campaignName")}
            />
            <label htmlFor="camp_name">
              Campaign Name <span className="req">*</span>
            </label>
            {errors.campaignName && (
              <small className="field-error">
                {errors.campaignName.message}
              </small>
            )}
          </div>

          {/* Key Message — full width (long input) */}
          <div className="form-floating form-grid-full">
            <input
              type="text"
              className="form-control"
              id="camp_message"
              placeholder=" "
              {...register("keyMessage")}
            />
            <label htmlFor="camp_message">
              Key Message <span className="req">*</span>
            </label>
            <small className="text-muted">
              Campaign ID auto-generates as{" "}
              <code className="code-chip">IFC###</code> (Influencer Campaign +
              linear number).
            </small>
            {errors.keyMessage && (
              <small className="field-error">{errors.keyMessage.message}</small>
            )}
          </div>

          {/* Campaign dates — paired, required planning window */}
          <div className="form-floating">
            <input
              type="date"
              className="form-control"
              id="camp_start_date"
              placeholder=" "
              {...register("startDate")}
            />
            <label htmlFor="camp_start_date">
              Start Date <span className="req">*</span>
            </label>
            {errors.startDate && (
              <small className="field-error">{errors.startDate.message}</small>
            )}
          </div>

          <div className="form-floating">
            <input
              type="date"
              className="form-control"
              id="camp_end_date"
              placeholder=" "
              {...register("endDate")}
            />
            <label htmlFor="camp_end_date">
              End Date <span className="req">*</span>
            </label>
            {errors.endDate && (
              <small className="field-error">{errors.endDate.message}</small>
            )}
          </div>

          {/* No. of Creators — half width, paired with Link to Brief */}
          <div className="form-floating">
            <input
              type="number"
              className="form-control"
              id="camp_creators"
              placeholder=" "
              min={1}
              {...register("numCreators")}
            />
            <label htmlFor="camp_creators">No. of Creators</label>
          </div>

          {/* Link to Brief — half width */}
          <div className="form-floating">
            <input
              type="url"
              className="form-control"
              id="camp_brief_link"
              placeholder=" "
              {...register("briefLink")}
            />
            <label htmlFor="camp_brief_link">
              Link to Brief <span className="req">*</span>
            </label>
            {errors.briefLink && (
              <small className="field-error">{errors.briefLink.message}</small>
            )}
          </div>

          {/* Creators helper — full width below the pair */}
          <small className="text-muted form-grid-full">{creatorsHelper}</small>

          {/* Link to Internal Brief — full width */}
          <div className="form-floating form-grid-full">
            <input
              type="url"
              className="form-control"
              id="camp_internal_brief"
              placeholder=" "
              {...register("internalBrief")}
            />
            <label htmlFor="camp_internal_brief">Link to Internal Brief</label>
          </div>
        </div>
      </div>

      {/* ── Campaign Budget ───────────────────────────────────────────── */}
      <div className="glass-card campaign-section-card campaign-budget-section">
        <div className="campaign-budget-head">
          <div className="campaign-budget-head__copy">
            <h5 className="section-title mb-1">
              <Coins size={14} className="inline mr-2" />
              Campaign Budget <span className="req">*</span>
            </h5>
            <small className="text-muted">
              Mirrors the <code className="code-chip">Budget</code> tab in
              Influencer Tracker. At least one line with allocated influencers
              required.
            </small>
          </div>
          <button
            type="button"
            className="btn btn-accent btn-sm campaign-add-line"
            onClick={handleAddRow}
          >
            <Plus size={12} />
            Add Line
          </button>
        </div>

        {capStrip}

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

        {/* Desktop table */}
        <div className="budget-wrap hidden md:block">
          <table id="budget-entry-table" className="budget-table">
            <colgroup>
              <col style={{ width: 160 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Tier</th>
                <th>Collab</th>
                <th>Campaign Name</th>
                <th style={{ textAlign: "center" }}>No.</th>
                <th style={{ textAlign: "right" }}>Avg Comp ₹</th>
                <th style={{ textAlign: "right" }}>Comp Total</th>
                <th style={{ textAlign: "center" }}>Min G</th>
                <th style={{ textAlign: "center" }}>Max G</th>
                <th style={{ textAlign: "right" }}>Garm Cost</th>
                <th style={{ textAlign: "right" }}>Total ₹</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 ? (
                <tr>
                  <td colSpan={11} className="empty-row">
                    No rows yet. Add a line above, or set No. of Creators to
                    auto-seed Barter + Paid.
                  </td>
                </tr>
              ) : (
                fields.map((field, idx) => {
                  const row = rows[idx];
                  const isBarter = row?.collabType === "Barter";
                  const estG = row ? computeRowEstGarment(row) : 0;
                  const compTot = row ? computeRowCompTotal(row) : 0;
                  const totalAll = row ? computeRowTotal(row) : 0;
                  return (
                    <tr key={field.id}>
                      <td>
                        <Controller
                          control={control}
                          name={`budgetRows.${idx}.tier`}
                          render={({ field }) => (
                            <SearchableSelect
                              className="br-tier"
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              options={INFLUENCER_TIERS.map((t) => ({
                                value: t,
                                label: t,
                              }))}
                              searchPlaceholder="Search tiers…"
                            />
                          )}
                        />
                      </td>
                      <td>
                        <Controller
                          control={control}
                          name={`budgetRows.${idx}.collabType`}
                          render={({ field }) => (
                            <SearchableSelect
                              className="br-collab"
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              options={COLLAB_TYPES.map((c) => ({
                                value: c,
                                label: c,
                              }))}
                              searchPlaceholder="Search…"
                            />
                          )}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          className="form-control br-segment br-readonly"
                          placeholder="Set Campaign Name above"
                          {...register(`budgetRows.${idx}.campaignName`)}
                        />
                      </td>
                      <td className="num">
                        <Controller
                          control={control}
                          name={`budgetRows.${idx}.numInfluencers`}
                          render={({ field }) => (
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="form-control br-num"
                              value={field.value ?? ""}
                              onBlur={field.onBlur}
                              onKeyDown={blockNonNumericChromeKeys}
                              onChange={(event) =>
                                field.onChange(digitsOnly(event.target.value))
                              }
                            />
                          )}
                        />
                      </td>
                      <td className="right">
                        <Controller
                          control={control}
                          name={`budgetRows.${idx}.avgComp`}
                          render={({ field }) => (
                            <input
                              type="number"
                              min={0}
                              inputMode="decimal"
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
                              value={field.value ?? ""}
                              onBlur={field.onBlur}
                              onKeyDown={blockNonNumericChromeKeys}
                              onChange={(event) =>
                                field.onChange(decimalOnly(event.target.value))
                              }
                            />
                          )}
                        />
                      </td>
                      <td
                        className="computed flash"
                        key={`ct-${idx}-${compTot}`}
                      >
                        {fmtINR(compTot)}
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          readOnly
                          tabIndex={-1}
                          className="form-control br-mingar br-readonly"
                          value={MIN_GARMENTS_FIXED}
                          onChange={() => {}}
                        />
                      </td>
                      <td className="num">
                        <Controller
                          control={control}
                          name={`budgetRows.${idx}.maxGarments`}
                          render={({ field }) => (
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="form-control br-maxgar"
                              value={field.value ?? ""}
                              onBlur={field.onBlur}
                              onKeyDown={blockNonNumericChromeKeys}
                              onChange={(event) =>
                                field.onChange(digitsOnly(event.target.value))
                              }
                            />
                          )}
                        />
                      </td>
                      <td className="computed flash" key={`eg-${idx}-${estG}`}>
                        {fmtINR(estG)}
                      </td>
                      <td
                        className="computed primary flash"
                        key={`ta-${idx}-${totalAll}`}
                      >
                        {fmtINR(totalAll)}
                      </td>
                      <td className="remove">
                        <button
                          type="button"
                          className="btn-icon-remove"
                          onClick={() => remove(idx)}
                          aria-label="Remove row"
                        >
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="label">
                  TOTAL
                </td>
                <td className="num flash" key={`tot-inf-${totals.allocated}`}>
                  {totals.allocated}
                </td>
                <td></td>
                <td
                  className="right flash"
                  key={`tot-comp-${totals.totalComp}`}
                >
                  {fmtINR(totals.totalComp)}
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td className="right flash" key={`tot-all-${totals.totalAll}`}>
                  {fmtINR(totals.totalAll)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="campaign-budget-mobile md:hidden">
          {fields.length === 0 && (
            <div className="empty-row">
              No rows yet. Tap "Add Line", or set No. of Creators to auto-seed.
            </div>
          )}
          {fields.map((field, idx) => {
            const row = rows[idx];
            const isBarter = row?.collabType === "Barter";
            const estG = row ? computeRowEstGarment(row) : 0;
            const compTot = row ? computeRowCompTotal(row) : 0;
            const totalAll = row ? computeRowTotal(row) : 0;
            return (
              <div key={field.id} className="budget-card">
                <div className="budget-card-head">
                  <div>
                    <span className="budget-card-kicker">Row {idx + 1}</span>
                    <strong>{row?.collabType || "Budget line"}</strong>
                  </div>
                  <span className="budget-card-total">{fmtINR(totalAll)}</span>
                  <button
                    type="button"
                    className="btn-icon-remove"
                    onClick={() => remove(idx)}
                    aria-label="Remove row"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="budget-card-grid">
                  <label className="form-field budget-field-wide">
                    <span>Tier</span>
                    <Controller
                      control={control}
                      name={`budgetRows.${idx}.tier`}
                      render={({ field }) => (
                        <SearchableSelect
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          options={INFLUENCER_TIERS.map((t) => ({
                            value: t,
                            label: t,
                          }))}
                          searchPlaceholder="Search tiers…"
                        />
                      )}
                    />
                  </label>
                  <label className="form-field">
                    <span>Collab</span>
                    <Controller
                      control={control}
                      name={`budgetRows.${idx}.collabType`}
                      render={({ field }) => (
                        <SearchableSelect
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          options={COLLAB_TYPES.map((c) => ({
                            value: c,
                            label: c,
                          }))}
                          searchPlaceholder="Search…"
                        />
                      )}
                    />
                  </label>
                  <label className="form-field">
                    <span>No.</span>
                    <Controller
                      control={control}
                      name={`budgetRows.${idx}.numInfluencers`}
                      render={({ field }) => (
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="form-control"
                          value={field.value ?? ""}
                          onBlur={field.onBlur}
                          onKeyDown={blockNonNumericChromeKeys}
                          onChange={(event) =>
                            field.onChange(digitsOnly(event.target.value))
                          }
                        />
                      )}
                    />
                  </label>
                  <label className="form-field">
                    <span>Avg ₹</span>
                    <Controller
                      control={control}
                      name={`budgetRows.${idx}.avgComp`}
                      render={({ field }) => (
                        <input
                          type="number"
                          min={0}
                          inputMode="decimal"
                          readOnly={isBarter}
                          className={cn(
                            "form-control",
                            isBarter && "br-readonly",
                          )}
                          value={field.value ?? ""}
                          onBlur={field.onBlur}
                          onKeyDown={blockNonNumericChromeKeys}
                          onChange={(event) =>
                            field.onChange(decimalOnly(event.target.value))
                          }
                        />
                      )}
                    />
                  </label>
                  <label className="form-field">
                    <span>Min G</span>
                    <input
                      type="number"
                      readOnly
                      className="form-control br-readonly"
                      value={MIN_GARMENTS_FIXED}
                      onChange={() => {}}
                    />
                  </label>
                  <label className="form-field">
                    <span>Max G</span>
                    <Controller
                      control={control}
                      name={`budgetRows.${idx}.maxGarments`}
                      render={({ field }) => (
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="form-control"
                          value={field.value ?? ""}
                          onBlur={field.onBlur}
                          onKeyDown={blockNonNumericChromeKeys}
                          onChange={(event) =>
                            field.onChange(digitsOnly(event.target.value))
                          }
                        />
                      )}
                    />
                  </label>
                </div>
                <dl className="row-totals mt-2">
                  <div>
                    <dt>Comp</dt>
                    <dd className="flash" key={`m-ct-${idx}-${compTot}`}>
                      {fmtINR(compTot)}
                    </dd>
                  </div>
                  <div>
                    <dt>Garm</dt>
                    <dd className="flash" key={`m-eg-${idx}-${estG}`}>
                      {fmtINR(estG)}
                    </dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd
                      className="primary flash"
                      key={`m-ta-${idx}-${totalAll}`}
                    >
                      {fmtINR(totalAll)}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
          {/* Mobile totals bar */}
          {fields.length > 0 && (
            <div className="mobile-totals">
              <div>
                <span>Influencers</span>
                <strong>{totals.allocated}</strong>
              </div>
              <div>
                <span>Comp</span>
                <strong>{fmtINR(totals.totalComp)}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{fmtINR(totals.totalAll)}</strong>
              </div>
            </div>
          )}
        </div>

        <small className="text-muted block mt-2">
          Garment Cost auto-computes as{" "}
          <code className="code-chip">Max Garments × ₹900 × 0.6</code>. Total =
          Comp Total + (Garment Cost × No.).
        </small>

        {errors.budgetRows && typeof errors.budgetRows.message === "string" && (
          <small className="field-error block mt-2">
            {errors.budgetRows.message}
          </small>
        )}
      </div>

      {/* ── Submit ────────────────────────────────────────────────────── */}
      <MissingFieldsAlert fields={campaignMissingFields} />
      <div className="submit-bar">
        <button
          type="submit"
          id="campaignSubmitBtn"
          className={cn("btn-primary-cta", submitting && "is-loading")}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {isEdit ? "Saving..." : "Creating..."}
            </>
          ) : (
            <>
              <CheckCircle2 size={14} />
              {isEdit ? "Save Changes" : "Create Campaign"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
