"use client";

import { useTransition, useState, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Megaphone,
  IdCard,
  BarChart3,
  CheckCircle2,
  FileText,
  Search,
  Instagram as InstagramIcon,
  Database,
  Lightbulb,
  AlertCircle,
  Loader2,
  Clock,
  Info,
  UserCheck,
  ShieldCheck,
  Layers,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatFollowers, tierFromFollowers } from "@/lib/formatters";
import { Avatar } from "@/components/ui/avatar";
import { MissingFieldsAlert } from "@/components/ui/missing-fields-alert";
import {
  REACHOUT_DEFAULTS,
  ReachOutSchema,
  type ReachOutInput,
  LANGUAGES,
  GENDERS,
} from "./schema";
import { CONTENT_CODES, findContentCode } from "./content-codes";
import {
  lookupCreator,
  submitReachOut,
  type CreatorLookupHit,
} from "./actions";

interface OutboundFormProps {
  campaigns: {
    campaign_id: string;
    campaign_name: string | null;
    status: string | null;
    brief_link: string | null;
    creator_cap?: number;
    creators_used?: number;
  }[];
  /** 'outbound' (we initiate) | 'inbound' (creator initiated). Defaults outbound. */
  direction?: "outbound" | "inbound";
  /** Campaign to preselect after creating a campaign upstream. */
  initialCampaignId?: string;
}

type LookupState = "idle" | "loading" | "found" | "queued";

export function OutboundForm({
  campaigns,
  direction = "outbound",
  initialCampaignId,
}: OutboundFormProps) {
  const [submitting, startSubmit] = useTransition();
  const [, startLookup] = useTransition();
  const [hit, setHit] = useState<CreatorLookupHit | null>(null);
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [verificationOverridden, setVerificationOverridden] = useState(false);
  const defaultCampaignId =
    initialCampaignId &&
    campaigns.some((campaign) => campaign.campaign_id === initialCampaignId)
      ? initialCampaignId
      : "";
  const formDefaults: ReachOutInput = {
    ...REACHOUT_DEFAULTS,
    reachoutDirection: direction,
    campaignId: defaultCampaignId,
  };

  const [submitAttempted, setSubmitAttempted] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    reset,
    watch,
    formState: { errors },
  } = useForm<ReachOutInput>({
    resolver: zodResolver(ReachOutSchema),
    defaultValues: formDefaults,
    mode: "onBlur",
    reValidateMode: "onChange",
    criteriaMode: "all",
    shouldFocusError: true,
  });

  const selectedCampaignId = watch("campaignId");
  const selectedCampaign = campaigns.find(
    (c) => c.campaign_id === selectedCampaignId,
  );
  const followers = watch("followers");
  const verification = watch("verification");
  const contentType = watch("contentType");

  const categoryTier = tierFromFollowers(followers) ?? hit?.category ?? "";
  const hasResolvedProfile =
    lookupState === "found" && hit && hit.source !== "queued";
  const isQueued = lookupState === "queued";
  // Existing creator — identity-level fields lock (gender, language, name).
  // Metrics that drift over time (followers, ER, avg likes) ONLY lock when
  // the lookup actually returned a value (cache hit). Creators rows never
  // return these any more, so existing-creator forms keep them editable.
  const isExistingCreator = hit?.source === "creator";
  const lockName = !!(hasResolvedProfile && hit?.inf_name != null) || isQueued;
  const lockFollowers = !!(hasResolvedProfile && hit?.followers != null) || isQueued;
  const lockEr = !!(hasResolvedProfile && hit?.er != null) || isQueued;
  const lockAvgLikes = !!(hasResolvedProfile && hit?.avg_likes != null) || isQueued;
  const isAutoDetected =
    hasResolvedProfile && hit?.verification != null && !verificationOverridden;

  useEffect(() => {
    if (!defaultCampaignId) return;
    setValue("campaignId", defaultCampaignId, { shouldDirty: false });
  }, [defaultCampaignId, setValue]);

  useEffect(() => {
    if (!contentType) return;
    const meta = findContentCode(contentType);
    if (meta && !getValues("contentName")) {
      setValue("contentName", meta.name, { shouldDirty: false });
    }
  }, [contentType, getValues, setValue]);

  const runLookup = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    setLookupState("loading");
    setVerificationOverridden(false);
    startLookup(async () => {
      const result = await lookupCreator(cleaned);
      if (!result) {
        setHit(null);
        setLookupState("idle");
        toast.error("Could not parse Instagram URL");
        return;
      }
      setHit(result);
      setLookupState(result.source === "queued" ? "queued" : "found");

      // Reset auto-fillable fields before applying new lookup — stops stale
      // data from a prior fetch (e.g. previous creator's name) from sticking.
      const AUTO_FIELDS = [
        "influencerName",
        "followers",
        "gender",
        "language",
        "er",
        "avgLikes",
      ] as const;
      for (const k of AUTO_FIELDS) {
        setValue(
          k as keyof ReachOutInput,
          REACHOUT_DEFAULTS[k as keyof ReachOutInput] as never,
          {
            shouldDirty: false,
          },
        );
      }

      // Now overwrite with the new lookup values. Skip nulls.
      const set = <K extends keyof ReachOutInput>(
        key: K,
        value: ReachOutInput[K] | null | undefined,
      ) => {
        if (value === null || value === undefined) return;
        if (typeof value === "string" && value.trim() === "") return;
        setValue(key, value as never, { shouldDirty: true });
      };

      setValue("instagramLink", result.instagram_link ?? cleaned, {
        shouldDirty: true,
      });
      if (result.source === "queued") {
        // Queued — metrics will arrive via 3-hr cron. Pre-fill name with
        // username so schema validation passes; all metric fields are disabled.
        setValue("influencerName", result.username ?? "", { shouldDirty: true });
      } else {
        set("influencerName", result.inf_name);
        if (result.followers != null) set("followers", result.followers as never);
        if (result.gender) {
          const g = result.gender as ReachOutInput["gender"];
          if (GENDERS.includes(g)) set("gender", g);
        }
        if (result.language) {
          const lang = result.language as ReachOutInput["language"];
          if ((LANGUAGES as readonly string[]).includes(lang))
            set("language", lang);
        }
        if (result.er != null) set("er", result.er as never);
        if (result.avg_likes != null) set("avgLikes", result.avg_likes as never);
      }

      if (result.verification === "Yes")
        setValue("verification", "Verified", { shouldDirty: true });
      else if (result.verification === "No")
        setValue("verification", "Non-Verified", { shouldDirty: true });
      else setValue("verification", "Pending", { shouldDirty: true });

      if (result.source === "creator")
        toast.success("Loaded from Creator Data");
      else if (result.source === "instagram_cache")
        toast.success("Loaded from Instagram Cache");
      else toast.info("Queued for the 3-hour Instagram trigger");
    });
  };

  const FIELD_LABELS_OUTBOUND: Record<keyof ReachOutInput, string> = {
    reachoutDirection: "Reach Out Direction",
    campaignId: "Campaign ID",
    instagramLink: "Instagram URL",
    influencerName: "Full Name",
    followers: "Followers",
    gender: "Gender",
    verification: "Verification Status",
    contentType: "Content Type",
    contentName: "Content Name",
    language: "Primary Language",
    er: "Engagement Rate",
    avgLikes: "Avg Likes",
  };

  // Schema-driven missing-fields scan. Runs ReachOutSchema.safeParse against
  // the live form snapshot every render — this guarantees EVERY required
  // field that isn't filled appears in the banner, not just the ones the
  // user happened to blur. Only renders after the first submit click so the
  // banner doesn't yell at the user before they've even tried.
  const allValues = watch();
  const missingFieldLabels = useMemo<string[]>(() => {
    if (!submitAttempted) return [];
    const parsed = ReachOutSchema.safeParse(allValues);
    if (parsed.success) return [];
    const keys = new Set<string>();
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "");
      if (k) keys.add(k);
    }
    return Array.from(keys)
      .map((k) => FIELD_LABELS_OUTBOUND[k as keyof ReachOutInput])
      .filter((v): v is string => Boolean(v));
  }, [submitAttempted, allValues]);

  const onSubmit = (event: React.FormEvent) => {
    setSubmitAttempted(true);
    handleSubmit(
      (values) => {
        startSubmit(async () => {
          const res = await submitReachOut(values);
          if (!res.ok) {
            if (res.fieldErrors)
              Object.entries(res.fieldErrors).forEach(([, msg]) =>
                toast.error(msg),
              );
            toast.error(res.error);
            return;
          }
          toast.success(`Reach-out created: ${res.postId}`);
          reset(formDefaults);
          setSubmitAttempted(false);
          setHit(null);
          setLookupState("idle");
          setVerificationOverridden(false);
        });
      },
      (errs) => {
        const count = Object.keys(errs).length;
        toast.error(
          `Fill ${count} required field${count > 1 ? "s" : ""} to submit.`,
        );
      },
    )(event);
  };

  return (
    <form className="reachout-form" onSubmit={onSubmit}>
      {/* ============ STEP 1 — Campaign Assignment =========================== */}
      <section
        className="glass-card reachout-step-card"
        style={{ animationDelay: "0ms" }}
      >
        <h5 className="section-title">
          <Megaphone aria-hidden /> Campaign Assignment
          <span className="section-status-chip">Required</span>
          <button
            type="button"
            className="section-info-trigger"
            aria-label="Campaign tip"
            title="The campaign picked here will be auto-selected when this creator opens Order Creation after onboarding."
          >
            <Info aria-hidden />
          </button>
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div className="md:col-span-2">
            <Controller
              control={control}
              name="campaignId"
              render={({ field }) => (
                <div className="form-floating">
                  <select
                    {...field}
                    id="ro_campaign"
                    className="form-control form-select"
                    required
                  >
                    <option value=""></option>
                    {campaigns.map((c) => (
                      <option key={c.campaign_id} value={c.campaign_id}>
                        {c.campaign_id +
                          (c.campaign_name ? ` · ${c.campaign_name}` : "")}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="ro_campaign">
                    Campaign ID <span className="req">*</span>
                  </label>
                </div>
              )}
            />
            {selectedCampaign?.brief_link ? (
              <span className="brief-chip">
                <FileText aria-hidden />
                <span className="brief-label">Campaign brief</span>
                <a
                  className="brief-link"
                  href={selectedCampaign.brief_link}
                  target="_blank"
                  rel="noopener"
                >
                  Open
                </a>
              </span>
            ) : selectedCampaign ? (
              <span className="brief-chip brief-missing">
                <FileText aria-hidden />
                <span className="brief-label">No brief uploaded yet</span>
              </span>
            ) : null}
            {selectedCampaign && (selectedCampaign.creator_cap ?? 0) > 0
              ? (() => {
                  const cap = selectedCampaign.creator_cap ?? 0;
                  const used = selectedCampaign.creators_used ?? 0;
                  const closed =
                    (selectedCampaign.status ?? "").trim().toLowerCase() ===
                    "closed";
                  const full = used >= cap;
                  const tone = closed
                    ? "pill--danger"
                    : full
                      ? "pill--warning"
                      : "pill--muted";
                  return (
                    <span
                      className={`pill ${tone} mt-2`}
                      title="Creator slots used / cap for this campaign"
                    >
                      <Users size={11} aria-hidden />
                      {used} / {cap} creators
                      {closed
                        ? " · closed — reopen to add"
                        : full
                          ? " · full — raise the cap"
                          : ` · ${cap - used} left`}
                    </span>
                  );
                })()
              : null}
            {errors.campaignId && (
              <p className="mt-2 text-[0.75rem] text-danger">
                {errors.campaignId.message}
              </p>
            )}
          </div>

          <aside className="hidden md:block md:col-span-1 rounded-md border border-border bg-bg-white p-3 text-[0.82rem] leading-relaxed text-text-secondary">
            <div className="flex items-center gap-1.5 text-text-secondary font-semibold mb-1 text-[0.78rem]">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Tip
            </div>
            The campaign picked here will be <strong>auto-selected</strong> when
            this creator opens Order Creation after onboarding.
          </aside>
        </div>
      </section>

      {/* ============ STEP 2 — Influencer Profile ============================ */}
      <section
        className="glass-card reachout-step-card"
        style={{ animationDelay: "55ms" }}
      >
        <h5 className="section-title">
          <IdCard aria-hidden /> Influencer Profile
          <span className="section-status-chip">Auto-fill</span>
        </h5>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* LEFT — form fields */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label htmlFor="ro_username" className="form-label-static">
                Instagram Profile URL <span className="req">*</span>
              </label>
              <div className="input-group">
                <span className="input-group-text">
                  <InstagramIcon className="h-4 w-4" aria-hidden />
                </span>
                <input
                  {...register("instagramLink")}
                  id="ro_username"
                  type="text"
                  className="form-control"
                  placeholder="https://www.instagram.com/handle"
                  style={{ fontWeight: 600 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runLookup((e.target as HTMLInputElement).value);
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value.trim()) runLookup(e.target.value);
                  }}
                />
                <button
                  type="button"
                  className="btn-input-attached"
                  disabled={lookupState === "loading"}
                  onClick={() => {
                    const v = getValues("instagramLink");
                    if (v) runLookup(v);
                  }}
                >
                  {lookupState === "loading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  Fetch Details
                </button>
              </div>
              <p className="mt-1 text-[0.72rem] text-text-tertiary flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                <span className="hidden sm:inline">
                  Creator Data is checked first, then Instagram Cache/API. Full
                  name, followers, ER, category, and profile image auto-fill
                  when available.
                </span>
                <span className="sm:hidden">Auto-fills when available.</span>
                <button
                  type="button"
                  className="mobile-field-tooltip sm:hidden"
                  aria-label="Instagram lookup details"
                  title="Creator Data is checked first, then Instagram Cache/API. Full name, followers, ER, category, and profile image auto-fill when available."
                >
                  <Info aria-hidden />
                </button>
              </p>

              {hasResolvedProfile && (
                <p className="loaded-from-line">
                  <span className="icon-disc">
                    <Layers className="h-3 w-3" aria-hidden />
                  </span>
                  {hit?.source === "creator"
                    ? "Loaded from Creator Data — identity locked, metrics editable for this collab."
                    : "Loaded from Instagram Cache — metrics filled from latest scrape."}
                </p>
              )}
              {isQueued && (
                <p className="loaded-from-line queued">
                  <span className="icon-disc">
                    <Clock className="h-3 w-3" aria-hidden />
                  </span>
                  Queued for the 3-hour Instagram trigger. Fill the fields below
                  manually for now.
                </p>
              )}
              {errors.instagramLink && (
                <p className="mt-2 text-[0.75rem] text-danger">
                  {errors.instagramLink.message}
                </p>
              )}
            </div>

            <div className="reachout-profile-grid grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="form-floating relative">
                <input
                  {...register("influencerName")}
                  id="ro_name"
                  className={cn("form-control", lockName && "field-auto")}
                  placeholder=" "
                  readOnly={lockName}
                />
                <label htmlFor="ro_name">
                  Full Name <span className="req">*</span>
                </label>
                {lockName && <span className="autofill-badge">{isQueued ? "PENDING" : "AUTO"}</span>}
              </div>

              <div className="form-floating relative">
                <input
                  {...register("followers")}
                  id="ro_followers"
                  type="number"
                  inputMode="numeric"
                  className={cn("form-control", lockFollowers && "field-auto")}
                  placeholder=" "
                  readOnly={lockFollowers}
                />
                <label htmlFor="ro_followers">
                  Followers <span className="req">*</span>
                </label>
                {lockFollowers && <span className="autofill-badge">{isQueued ? "PENDING" : "AUTO"}</span>}
              </div>

              <div className="form-floating sm:col-span-2">
                <input
                  value={categoryTier}
                  className="form-control field-readonly"
                  placeholder=" "
                  readOnly
                />
                <label>Category Tier</label>
              </div>
            </div>
          </div>

          {/* RIGHT — profile preview */}
          <div className="lg:col-span-1">
            <div className="ig-profile-preview-wrap">
              {!hit ? (
                <div className="ig-profile-placeholder">
                  <InstagramIcon aria-hidden />
                  <p>
                    Paste an Instagram URL and press <strong>Enter</strong> to
                    preview.
                  </p>
                  <small>Found rows auto-fill the form below.</small>
                </div>
              ) : (
                <div className="ig-profile-card">
                  <div className="ig-card-cover" />
                  <div className="ig-card-avatar-wrap">
                    <div className="ig-avatar-ring-outer">
                      <Avatar
                        src={hit.profile_pic}
                        username={hit.username}
                        name={hit.inf_name}
                        verified={hit.verification === "Yes"}
                        size={88}
                        className="ig-card-avatar"
                      />
                    </div>
                  </div>
                  <div className="ig-card-body">
                    <span
                      className={cn(
                        "ig-source-badge",
                        hit.source === "creator"
                          ? "ig-source-creator"
                          : hit.source === "instagram_cache"
                            ? "ig-source-cache"
                            : "ig-source-queued",
                      )}
                    >
                      {hit.source === "creator" ? (
                        <Layers className="h-3 w-3" />
                      ) : hit.source === "instagram_cache" ? (
                        <Database className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {hit.source === "creator"
                        ? "From Records"
                        : hit.source === "instagram_cache"
                          ? "From Cache"
                          : "Queued · 3hr"}
                    </span>
                    <div className="ig-card-name">
                      {hit.inf_name ?? hit.username}
                      {hit.verification === "Yes" && (
                        <span
                          className="ig-verified-badge"
                          aria-label="Verified"
                        >
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="ig-card-username">@{hit.username}</div>
                    {hit.category && (
                      <div className="ig-tier-pill">{hit.category} TIER</div>
                    )}
                    <div className="ig-card-stats">
                      <div className="ig-stat-cell">
                        <div className="ig-stat-val">
                          {formatFollowers(hit.followers)}
                        </div>
                        <div className="ig-stat-lbl">Followers</div>
                      </div>
                      <div className="ig-stat-cell">
                        <div className="ig-stat-val">
                          {hit.er != null ? `${hit.er.toFixed(2)}%` : "—"}
                        </div>
                        <div className="ig-stat-lbl">Eng. Rate</div>
                      </div>
                      <div className="ig-stat-cell">
                        <div className="ig-stat-val">{hit.category ?? "—"}</div>
                        <div className="ig-stat-lbl">Tier</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============ STEP 3 — Content & Metrics ============================ */}
      <section
        className="glass-card reachout-step-card"
        style={{ animationDelay: "110ms" }}
      >
        <h5 className="section-title">
          <BarChart3 aria-hidden /> Content & Metrics
          <span className="section-status-chip">Required</span>
        </h5>
        <div className="reachout-compact-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <div className="form-floating relative">
                <select
                  {...field}
                  id="ro_gender"
                  className={cn(
                    "form-control form-select",
                    isExistingCreator && "field-auto",
                  )}
                  required
                  disabled={isExistingCreator}
                >
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <label htmlFor="ro_gender">
                  Gender <span className="req">*</span>
                </label>
                {isExistingCreator && (
                  <span className="autofill-badge">AUTO</span>
                )}
              </div>
            )}
          />

          {/* Verification — legacy parity: AUTO-DETECTED pill when found, manual toggle otherwise */}
          <Controller
            control={control}
            name="verification"
            render={({ field }) => (
              <div className="reachout-verification-field lg:col-span-1">
                <label className="form-label-static">
                  Verification Status <span className="req">*</span>
                </label>
                {isAutoDetected && field.value === "Verified" ? (
                  <div className="verif-auto-pill">
                    <span className="check">✓</span>
                    <div className="label-stack">
                      <div className="primary">Verified</div>
                      <div className="meta">Auto-detected</div>
                    </div>
                    <button
                      type="button"
                      className="override-btn"
                      onClick={() => {
                        setVerificationOverridden(true);
                      }}
                    >
                      Override
                    </button>
                  </div>
                ) : isAutoDetected && field.value === "Non-Verified" ? (
                  <div
                    className="verif-auto-pill"
                    style={{
                      background: "linear-gradient(135deg, #f5f1ec, #faf8f5)",
                      borderColor: "var(--color-border-strong)",
                      boxShadow: "none",
                    }}
                  >
                    <span
                      className="check"
                      style={{
                        background: "var(--color-text-secondary)",
                        boxShadow: "none",
                      }}
                    >
                      <UserCheck className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="label-stack">
                      <div
                        className="primary"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        Non-Verified
                      </div>
                      <div
                        className="meta"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Auto-detected
                      </div>
                    </div>
                    <button
                      type="button"
                      className="override-btn"
                      onClick={() => {
                        setVerificationOverridden(true);
                      }}
                    >
                      Override
                    </button>
                  </div>
                ) : verification === "Pending" && !verificationOverridden ? (
                  <div className="verif-pending-pill">
                    <span className="icon-clock">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="label-stack">
                      <div className="primary">Auto-Detect Pending</div>
                      <div className="meta">
                        3-hour trigger will fetch from Instagram
                      </div>
                    </div>
                    {!isQueued && (
                      <button
                        type="button"
                        className="override-btn"
                        onClick={() => {
                          setVerificationOverridden(true);
                          field.onChange("Verified");
                        }}
                      >
                        Override
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="verification-toggle-wrap">
                    <button
                      type="button"
                      onClick={() => field.onChange("Verified")}
                      className={cn(
                        "verif-btn",
                        field.value === "Verified" && "active-verified",
                      )}
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden /> Verified
                    </button>
                    <button
                      type="button"
                      onClick={() => field.onChange("Non-Verified")}
                      className={cn(
                        "verif-btn",
                        field.value === "Non-Verified" && "active-nonverified",
                      )}
                    >
                      <UserCheck className="h-4 w-4" aria-hidden /> Non-Verified
                    </button>
                  </div>
                )}
              </div>
            )}
          />

          <Controller
            control={control}
            name="contentType"
            render={({ field }) => (
              <div className="form-floating">
                <select
                  {...field}
                  id="ro_contentCode"
                  className="form-control form-select"
                  required
                >
                  <option value=""></option>
                  {CONTENT_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                <label htmlFor="ro_contentCode">
                  Content Type Code <span className="req">*</span>
                </label>
              </div>
            )}
          />

          <div className="form-floating">
            <input
              {...register("contentName")}
              id="ro_contentName"
              className="form-control field-readonly"
              placeholder=" "
              readOnly
            />
            <label htmlFor="ro_contentName">Content Type Name</label>
          </div>

          <Controller
            control={control}
            name="language"
            render={({ field }) => (
              <div className="form-floating reachout-language-field relative">
                <select
                  {...field}
                  id="ro_language"
                  className={cn(
                    "form-control form-select",
                    isExistingCreator && "field-auto",
                  )}
                  required
                  disabled={isExistingCreator}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <label htmlFor="ro_language">
                  Primary Language <span className="req">*</span>
                </label>
                {isExistingCreator && (
                  <span className="autofill-badge">AUTO</span>
                )}
              </div>
            )}
          />

          <div className="reachout-metric-pair grid grid-cols-1 sm:grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1">
            <div className="form-floating relative">
              <input
                {...register("er")}
                id="ro_er"
                type="number"
                step="any"
                className={cn("form-control", lockEr && "field-auto")}
                placeholder=" "
                readOnly={lockEr}
              />
              <label htmlFor="ro_er">Eng. Rate %</label>
              {lockEr && <span className="autofill-badge">{isQueued ? "PENDING" : "AUTO"}</span>}
            </div>
            <div className="form-floating relative">
              <input
                {...register("avgLikes")}
                id="ro_likes"
                type="number"
                className={cn("form-control", lockAvgLikes && "field-auto")}
                placeholder=" "
                readOnly={lockAvgLikes}
              />
              <label htmlFor="ro_likes">Avg Likes</label>
              {lockAvgLikes && <span className="autofill-badge">{isQueued ? "PENDING" : "AUTO"}</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        <MissingFieldsAlert fields={missingFieldLabels} />
        <div className="text-end">
          <button type="submit" className="btn-submit" disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {submitting ? "Submitting…" : "Create Reach Out"}
          </button>
        </div>
      </div>
    </form>
  );
}
