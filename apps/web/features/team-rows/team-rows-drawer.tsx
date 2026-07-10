"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  Instagram,
  Search,
  X,
  ExternalLink,
  Loader2,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { extractShortcode } from "@/lib/instagram-shortcode";
import { InstagramPreviewCard } from "@/components/ui/instagram-preview";
import { fetchTeamRows, type TeamRow } from "./actions";
import {
  historicBacklogOnboard,
  historicBacklogPosting,
} from "./backlog-actions";

// ── stage bucketing (mirrors the dashboard column logic) ───────────────────
type Stage = "reach" | "onboard" | "posted" | "delivered" | "closed";
function stageOf(r: TeamRow): Stage {
  const s = String(r.workflow_status ?? "").trim().toLowerCase();
  if (s.includes("delivered")) return "delivered";
  if (s.includes("posted")) return "posted";
  if (s.startsWith("rto") || s === "cancelled") return "closed";
  if (s.includes("on board") || s === "order sent") return "onboard";
  return "reach";
}
const STAGE_META: Record<Stage, { label: string; cls: string; accent: string }> = {
  reach: {
    label: "Reach Out",
    cls: "bg-[#EAF1FB] text-[#3B6FD4]",
    accent: "#3B6FD4",
  },
  onboard: {
    label: "Onboard",
    cls: "bg-[#F1EAFB] text-[#7B4FBF]",
    accent: "#7B4FBF",
  },
  posted: {
    label: "Posted",
    cls: "bg-[#E7F0FB] text-[#3B6FD4]",
    accent: "#3B6FD4",
  },
  delivered: {
    label: "Delivered",
    cls: "bg-success-bg text-success-text",
    accent: "#4F7C4D",
  },
  closed: {
    label: "RTO / Cancelled",
    cls: "bg-danger-bg text-danger-text",
    accent: "#C0392B",
  },
};
/** Board stages + derived buckets: "posted_no_order" (posted content whose
 *  order_id was never mapped = posted-but-not-onboarded), "due" (onboarded,
 *  awaiting the post) and "issues" (data-quality flags). */
type FilterKey =
  | Stage
  | "all"
  | "posted_no_order"
  | "due"
  | "issues";
const STAGE_FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "reach", label: "Reach Out" },
  { key: "onboard", label: "Onboard" },
  { key: "due", label: "Due" },
  { key: "posted", label: "Posted" },
  { key: "posted_no_order", label: "Posted · No Order" },
  { key: "delivered", label: "Delivered" },
  { key: "closed", label: "RTO / Cancelled" },
];
function hasOrder(r: TeamRow): boolean {
  return !!(r.order_id ?? "").trim();
}
function matchesFilter(r: TeamRow, f: FilterKey): boolean {
  if (f === "all" || f === "issues") return true; // "issues" handled by _issue flag
  if (f === "posted_no_order") {
    const st = stageOf(r);
    return (st === "posted" || st === "delivered") && !hasOrder(r);
  }
  // Onboarded (On Board / Order Sent) but the post hasn't landed → content due.
  if (f === "due") return stageOf(r) === "onboard";
  return stageOf(r) === f;
}

// Data-quality flags surfaced in the drawer.
const CONTENT_LINK_RE =
  /(?:https?:\/\/|(?:www\.)?(?:instagram\.com|youtube\.com|youtu\.be))/i;
function contentLinkOk(link: string | null): boolean {
  return typeof link === "string" && CONTENT_LINK_RE.test(link.trim());
}
type FlaggedRow = TeamRow & {
  /** "junk" = counts as posted but post_link isn't a real URL; "dup" = the reel
   *  shortcode is shared with a DIFFERENT creator's row (one link is wrong). */
  _issue?: "junk" | "dup" | null;
  _sharedWith?: string[];
};

const PAGE = 500;
const AD_OVERVIEW_MODAL_CLASSES =
  "modal-panel modal-panel--lg modal-panel--onboarding campaign-detail-modal ob-overview-modal ad-overview-modal ad-detail-modal";

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const [, y, mo, d] = m;
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${MON[Number(mo) - 1]} ${y}`;
}
function fmtNum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtMoney(n: number | null): string {
  return n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`;
}


// ── Row card ────────────────────────────────────────────────────────────────
function RowCard({ row, onOpen }: { row: FlaggedRow; onOpen: () => void }) {
  const stage = stageOf(row);
  const meta = STAGE_META[stage];
  const igUrl = row.username
    ? `https://www.instagram.com/${row.username}/`
    : null;
  return (
    <div
      className="team-row-card flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border bg-bg-white p-2.5 transition-all hover:border-[#DCD6C4] hover:shadow-sm sm:p-3"
      style={{ borderLeft: `3px solid ${meta.accent}` }}
    >
      <InstagramPreviewCard
        pic={row.creator_pic ?? row.profile_pic}
        link={row.post_link}
        username={row.username}
        size={60}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[0.6rem] font-extrabold text-text-secondary bg-bg-surface border border-border rounded-full px-1.5 py-0.5">
            {row.post_id_short ?? row.inf_id ?? "—"}
          </span>
          {row.campaign_id && (
            <span className="text-[0.58rem] font-bold text-text-tertiary">{row.campaign_id}</span>
          )}
          <span className={cn("text-[0.55rem] font-extrabold uppercase rounded-full px-1.5 py-0.5", meta.cls)}>
            {meta.label}
          </span>
          <span className="text-[0.55rem] font-extrabold uppercase rounded-full px-1.5 py-0.5 bg-bg-surface text-text-tertiary border border-border">
            Historic
          </span>
          {row._issue && (
            <span
              className="inline-flex items-center gap-0.5 text-[0.55rem] font-extrabold uppercase rounded-full px-1.5 py-0.5 bg-danger-bg text-danger-text border border-danger-text/40"
              title={
                row._issue === "junk"
                  ? "Post link isn't a real URL but counts as posted"
                  : `Reel shared with ${row._sharedWith?.join(", ")}`
              }
            >
              <AlertTriangle size={9} aria-hidden />
              {row._issue === "junk" ? "Bad link" : "Dup reel"}
            </span>
          )}
        </div>
        <div className="text-[0.8rem] font-extrabold text-text-primary truncate mt-0.5">
          @{row.username ?? "—"}
        </div>
        <div className="text-[0.6rem] text-text-tertiary truncate">
          {row.influencer_category ?? "—"} · {fmtNum(row.followers)} followers ·{" "}
          {row.content_type ?? "—"}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-[0.58rem] text-text-tertiary">
          {fmtDate(row.post_date ?? row.reach_out_date)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-white px-2 py-1 text-[0.6rem] font-extrabold text-text-secondary hover:border-[#DCD6C4] hover:text-text-primary transition-colors"
            title="Open row overview"
          >
            <Eye size={11} aria-hidden /> Overview
          </button>
          {igUrl && (
            <a
              href={igUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-white px-2 py-1 text-[0.6rem] font-extrabold text-text-secondary hover:border-[#DCD6C4] hover:text-text-primary transition-colors"
              title="Visit Instagram profile"
            >
              <Instagram size={11} aria-hidden /> Profile
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail modal — every Tracker field ──────────────────────────────────────
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="campaign-detail-section team-row-detail-section">
      <div className="campaign-detail-section-head">
        <div>
          <h3>{title}</h3>
        </div>
      </div>
      <dl className="campaign-detail-stat-grid ad-detail-context-grid team-row-detail-grid">
        {children}
      </dl>
    </section>
  );
}

/**
 * Backlog filling on a historic row: complete the missing order (Onboard) or
 * the missing post link (Posting) straight from the drawer. Order fill pulls
 * every order detail from the synced Shopify order; posting fill auto-derives
 * the post date from the IG shortcode and auto-sends the partnership invite.
 */
function BacklogFillSection({
  row,
  onUpdated,
}: {
  row: FlaggedRow;
  onUpdated?: () => void;
}) {
  const needsOrder = !hasOrder(row);
  const needsPost = hasOrder(row) && !contentLinkOk(row.post_link);
  const [orderId, setOrderId] = useState(row.order_id ?? "");
  const [collabType, setCollabType] = useState(row.collab_type ?? "");
  const [postLink, setPostLink] = useState("");
  const [saving, setSaving] = useState<"order" | "post" | null>(null);
  const [done, setDone] = useState<"order" | "post" | null>(null);

  if (!needsOrder && !needsPost) return null;
  if (done) {
    return (
      <div className="rounded-xl border border-success-text/30 bg-success-bg px-3 py-2 text-[0.7rem] text-success-text font-bold">
        {done === "order"
          ? "Order details filled — the row is onboarded."
          : "Post saved — date auto-set, partnership invite sent."}
      </div>
    );
  }

  const saveOrder = () => {
    if (row.id == null) return;
    setSaving("order");
    historicBacklogOnboard({
      id: row.id,
      orderId,
      collabType: collabType || undefined,
    }).then((res) => {
      setSaving(null);
      if (!res.ok) {
        toast.error(res.error ?? "Could not fill the order");
        return;
      }
      toast.success(
        `Order ${res.applied?.order_id} filled — email/tracking/products updated.`,
      );
      setDone("order");
      onUpdated?.();
    });
  };

  const savePost = () => {
    if (row.id == null) return;
    setSaving("post");
    historicBacklogPosting({ id: row.id, postLink }).then((res) => {
      setSaving(null);
      if (!res.ok) {
        toast.error(res.error ?? "Could not save the post");
        return;
      }
      toast.success(
        `Posted — date ${res.postDate}${res.dateSource === "shortcode" ? " (from the post link)" : ""}. Partnership invite sent.`,
      );
      setDone("post");
      onUpdated?.();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-bg-surface px-3 py-2.5 flex flex-col gap-2">
      <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.06em] text-text-secondary">
        Fill backlog data
      </span>
      {needsOrder ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="onboarding-filter-select flex-1"
            placeholder="Shopify order id…"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
          <select
            className="onboarding-filter-select sm:w-40"
            value={collabType}
            onChange={(e) => setCollabType(e.target.value)}
          >
            <option value="">Collab type…</option>
            <option value="Barter">Barter</option>
            <option value="Barter + Paid">Barter + Paid</option>
          </select>
          <button
            type="button"
            className="acc-export-bar__btn acc-export-bar__btn--primary shrink-0"
            onClick={saveOrder}
            disabled={saving === "order" || !orderId.trim()}
          >
            {saving === "order" ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : null}
            Fill order
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="onboarding-filter-select flex-1"
            placeholder="https://www.instagram.com/reel/…"
            value={postLink}
            onChange={(e) => setPostLink(e.target.value)}
          />
          <button
            type="button"
            className="acc-export-bar__btn acc-export-bar__btn--primary shrink-0"
            onClick={savePost}
            disabled={saving === "post" || !postLink.trim()}
          >
            {saving === "post" ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : null}
            Save post
          </button>
        </div>
      )}
      <span className="text-[0.6rem] text-text-tertiary">
        {needsOrder
          ? "Order details (email, tracking, products, status) auto-fetch from the synced Shopify order. No email is sent."
          : "Post date auto-derives from the link; the creator's partnership invite is auto-sent."}
      </span>
    </div>
  );
}

function RowDetailModal({
  row,
  source = "historic",
  onUpdated,
  onClose,
}: {
  row: FlaggedRow;
  source?: "historic" | "live";
  onUpdated?: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted || typeof document === "undefined") return null;
  const stage = stageOf(row);
  const meta = STAGE_META[stage];
  const dash = (v: string | number | null | undefined) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`Row detail — ${row.username}`}
      onClick={onClose}
    >
      <div
        className={`${AD_OVERVIEW_MODAL_CLASSES} team-row-detail-modal`}
        style={{ "--campaign-accent": meta.accent } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head campaign-detail-head ad-detail-head">
          <div className="min-w-0">
            <div className="campaign-card__id-row">
              <span className="campaign-card__id tabular">
                {dash(row.post_id_short ?? row.inf_id)}
              </span>
              {row.collab_id && (
                <span className="campaign-card__status tabular">
                  {row.collab_id}
                </span>
              )}
              <span
                className={cn(
                  "text-[0.55rem] font-extrabold uppercase rounded-full px-1.5 py-0.5",
                  meta.cls,
                )}
              >
                {meta.label}
              </span>
              <span className="campaign-card__status tabular">Historic</span>
            </div>
            <h2>@{dash(row.username)}</h2>
            <p className="campaign-detail-subtitle">
              {dash(row.campaign_id)} · {dash(row.nomenclature)}
            </p>
          </div>
          <div className="modal-head__actions">
            <button
              type="button"
              className="icon-btn campaign-detail-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="modal-body campaign-detail-body ad-detail-body">
          {row._issue && (
            <div className="flex items-start gap-2 rounded-xl border border-danger-text/40 bg-danger-bg px-3 py-2 text-[0.7rem] text-danger-text">
              <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                {row._issue === "junk" ? (
                  <>
                    <strong>Data issue — bad post link.</strong> The LINK TO POST
                    isn&apos;t a real URL ({dash(row.post_link)}) yet this row
                    counts as posted. Fix it in the Tracker.
                  </>
                ) : (
                  <>
                    <strong>Data issue — duplicate reel.</strong> This reel is also
                    on {row._sharedWith?.join(", ")}. One of the LINK TO POST
                    entries is wrong — verify who actually posted it.
                  </>
                )}
              </span>
            </div>
          )}
          {source === "historic" && row.id != null && (
            <BacklogFillSection row={row} onUpdated={onUpdated} />
          )}
          <section className="campaign-detail-overview ad-detail-overview">
            <div className="campaign-detail-allocation-card ad-detail-profile-card">
              <div className="ad-detail-avatar-frame">
                <InstagramPreviewCard
                  pic={row.creator_pic ?? row.profile_pic}
                  link={row.post_link}
                  username={row.username}
                  size={84}
                />
              </div>
              <div className="campaign-detail-allocation-copy">
                <span>Creator / Row</span>
                <strong>@{dash(row.username)}</strong>
                <p className="ad-detail-profile-sub">
                  {dash(row.influencer_category)} · {fmtNum(row.followers)} followers ·{" "}
                  {dash(row.content_type)}
                </p>
                <span className="campaign-detail-progress-track ad-detail-progress-track">
                  <span
                    style={
                      {
                        "--ad-width": row.post_link ? "100%" : "12%",
                        "--ad-accent": meta.accent,
                      } as CSSProperties
                    }
                  />
                </span>
                <div className="campaign-detail-quick-actions">
                  <span className="campaign-detail-reachout-button">
                    <Instagram size={13} aria-hidden />
                    {row.post_link ? "Post Linked" : "No Post Link"}
                  </span>
                  <span className="campaign-detail-reachout-button">
                    {meta.label}
                  </span>
                </div>
              </div>
            </div>

            <dl className="campaign-detail-stat-grid ad-detail-stat-grid">
              <Field label="Campaign" value={dash(row.campaign_id)} />
              <Field label="Post Date" value={fmtDate(row.post_date)} />
              <Field
                label="Delivery"
                value={dash(row.order_status ?? row.workflow_status)}
              />
              <Field label="Followers" value={fmtNum(row.followers)} />
              <Field label="Commercial" value={fmtMoney(row.commercial_amount)} />
              <Field label="Order" value={dash(row.order_id)} />
            </dl>
          </section>

          <Group title="Identity">
            <Field label="Post ID" value={dash(row.post_id_short)} />
            <Field label="Legacy Post ID" value={dash(row.post_id)} />
            <Field label="Creator (SIF)" value={dash(row.inf_id)} />
            <Field label="Collab ID" value={dash(row.collab_id)} />
            <Field label="Post #" value={dash(row.post_number)} />
            <Field label="Collab #" value={dash(row.collab_number)} />
          </Group>
          <Group title="Creator">
            <Field label="Username" value={`@${dash(row.username)}`} />
            <Field label="Tier / Category" value={dash(row.influencer_category)} />
            <Field label="Followers" value={fmtNum(row.followers)} />
            <Field label="Avg Likes" value={fmtNum(row.avg_likes)} />
            <Field label="Engagement Rate" value={row.engaged_rate != null ? `${row.engaged_rate}%` : "—"} />
            <Field label="Gender" value={dash(row.gender)} />
            <Field label="Email" value={dash(row.email)} />
            <Field label="State / City" value={`${dash(row.state)} · ${dash(row.city)}`} />
          </Group>
          <Group title="Campaign & Content">
            <Field label="Campaign" value={dash(row.campaign_id)} />
            <Field label="Content Type" value={dash(row.content_type)} />
            <Field label="Collab Type" value={dash(row.collab_type)} />
            <Field label="Reach-out Direction" value={dash(row.reachout_direction)} />
            <Field label="Workflow Status" value={dash(row.workflow_status)} />
            <Field label="Source" value={dash(row.source_tag)} />
          </Group>
          <Group title="Dates">
            <Field label="Reach Out" value={fmtDate(row.reach_out_date)} />
            <Field label="Onboard" value={fmtDate(row.onboard_date)} />
            <Field label="Post Date" value={fmtDate(row.post_date)} />
            <Field label="Est. Delivery" value={fmtDate(row.est_delivery)} />
          </Group>
          <Group title="Order & Fulfillment">
            <Field label="Order ID" value={dash(row.order_id)} />
            <Field label="Tracking ID" value={dash(row.tracking_id)} />
            <Field label="Order Status" value={dash(row.order_status)} />
            <Field label="Garment Qty" value={dash(row.garment_qty)} />
            <Field label="Garments Sent" value={dash(row.garments_sent)} />
          </Group>
          <Group title="Payment & Attribution">
            <Field label="Payment Status" value={dash(row.payment_status)} />
            <Field label="Commercial" value={fmtMoney(row.commercial_amount)} />
            <Field label="Reach-out By" value={dash(row.logged_by)} />
            <Field label="Onboard By" value={dash(row.onboarded_by)} />
            <Field label="Agency" value={dash(row.agency_name)} />
          </Group>
          <Group title="Links & Notes">
            <Field
              label="Link to Post"
              value={
                row.post_link ? (
                  <a
                    href={row.post_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#3B6FD4] hover:underline break-all"
                  >
                    {row.post_link}
                  </a>
                ) : "—"
              }
            />
            <Field
              label="Download Link"
              value={
                row.download_link ? (
                  <a
                    href={row.download_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#3B6FD4] hover:underline break-all"
                  >
                    Open
                  </a>
                ) : "—"
              }
            />
            <Field label="Notes" value={dash(row.notes)} />
          </Group>
        </div>

        <footer className="modal-foot ob-overview-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {row.post_link && (
            <a
              href={row.post_link}
              target="_blank"
              rel="noreferrer"
              className="btn-primary-cta"
            >
              <ExternalLink size={14} aria-hidden />
              <span className="hidden sm:inline">Open on </span>Instagram
            </a>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────
export function TeamRowsDrawer({
  team,
  onClose,
  source = "historic",
}: {
  team: string;
  onClose: () => void;
  source?: "historic" | "live";
}) {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<FilterKey>("all");
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<TeamRow | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchTeamRows(team, source).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [team, source]);
  // Backlog fill saved inside the detail modal → refetch so the drawer + stage
  // counts reflect the new data without reopening.
  const reload = () => {
    fetchTeamRows(team, source).then((r) => setRows(r));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !selected && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selected]);
  useEffect(() => setVisible(PAGE), [q, stage]);

  // Compute data-quality flags: junk post_link (counts as posted but isn't a
  // real URL) + cross-creator duplicate reels (same shortcode on another
  // creator's row → one link is wrong).
  const flagged = useMemo<FlaggedRow[]>(() => {
    const src = (rows ?? []) as FlaggedRow[];
    const bySc = new Map<string, FlaggedRow[]>();
    for (const r of src) {
      const sc = extractShortcode(r.post_link ?? "");
      if (sc) {
        const arr = bySc.get(sc);
        if (arr) arr.push(r);
        else bySc.set(sc, [r]);
      }
    }
    return src.map((r) => {
      const link = (r.post_link ?? "").trim();
      const sc = extractShortcode(link);
      let issue: "junk" | "dup" | null = null;
      let sharedWith: string[] = [];
      if (link && !contentLinkOk(link)) {
        issue = "junk";
      } else if (sc) {
        const peers = (bySc.get(sc) ?? []).filter(
          (o) => o !== r && (o.username ?? "") !== (r.username ?? ""),
        );
        if (peers.length) {
          issue = "dup";
          sharedWith = [
            ...new Set(peers.map((p) => `@${p.username} (${p.post_id_short ?? "—"})`)),
          ];
        }
      }
      return { ...r, _issue: issue, _sharedWith: sharedWith };
    });
  }, [rows]);
  const issueCount = useMemo(
    () => flagged.filter((r) => r._issue).length,
    [flagged],
  );

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return flagged.filter((r) => {
      if (stage === "issues") {
        if (!r._issue) return false;
      } else if (!matchesFilter(r, stage)) return false;
      if (!ql) return true;
      return (
        (r.username ?? "").toLowerCase().includes(ql) ||
        (r.post_id_short ?? "").toLowerCase().includes(ql) ||
        (r.campaign_id ?? "").toLowerCase().includes(ql) ||
        (r.order_id ?? "").toLowerCase().includes(ql)
      );
    });
  }, [flagged, q, stage]);

  if (!mounted || typeof document === "undefined") return null;
  const visibleRows = filtered.slice(0, visible);
  const hasMore = rows != null && filtered.length > visible;

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`${team} — rows`}
      onClick={onClose}
    >
      <div
        className={`${AD_OVERVIEW_MODAL_CLASSES} team-rows-modal`}
        style={{ "--campaign-accent": "#B57514" } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head campaign-detail-head ad-detail-head team-rows-modal__head">
          <div className="min-w-0">
            <div className="campaign-card__id-row">
              <span className="campaign-card__id">Historic Rows</span>
              <span className="campaign-card__status">Team Member</span>
            </div>
            <h2>{team}</h2>
            <p className="campaign-detail-subtitle">
              {rows == null
                ? "Loading rows"
                : `${filtered.length.toLocaleString("en-IN")} rows`}
            </p>
          </div>
          <div className="modal-head__actions">
            <button
              type="button"
              className="icon-btn campaign-detail-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="modal-body campaign-detail-body ad-detail-body team-rows-modal__body">
          <section className="campaign-detail-section team-rows-modal__filters">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                aria-hidden
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search creator, POST ID, campaign, order..."
                className={cn(
                  "h-9 w-full rounded-full border border-border",
                  "bg-bg-white pl-8 pr-3 text-[0.75rem]",
                  "focus:border-[#DCD6C4] focus:outline-none",
                )}
              />
            </div>
            <div className="team-rows-modal__chips">
              {STAGE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStage(f.key)}
                  className={cn(
                    "text-[0.62rem] font-extrabold rounded-full px-2.5 py-1 border transition-colors",
                    stage === f.key
                      ? "bg-[#2C2420] text-[#F0C61E] border-[#2C2420]"
                      : "bg-bg-white text-text-secondary border-border hover:border-[#DCD6C4]",
                  )}
                >
                  {f.label}
                </button>
              ))}
              {issueCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStage("issues")}
                  className={cn(
                    "text-[0.62rem] font-extrabold rounded-full px-2.5 py-1 border transition-colors inline-flex items-center gap-1",
                    stage === "issues"
                      ? "bg-danger-text text-white border-danger-text"
                      : "bg-danger-bg text-danger-text border-danger-text/40 hover:border-danger-text",
                  )}
                  title="Rows with a data issue: junk post link or a reel shared with another creator"
                >
                  <AlertTriangle size={11} aria-hidden /> Issues {issueCount}
                </button>
              )}
            </div>
          </section>

          <section className="campaign-detail-section team-rows-modal__list">
            {rows == null ? (
              <div className="team-rows-modal__state">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              </div>
            ) : filtered.length === 0 ? (
              <div className="team-rows-modal__state">
                No rows match.
              </div>
            ) : (
              <div className="team-rows-modal__cards">
                {visibleRows.map((r, i) => (
                  <RowCard
                    key={`${r.post_id_short ?? r.post_id ?? "row"}-${i}`}
                    row={r}
                    onOpen={() => setSelected(r)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="modal-foot ob-overview-footer team-rows-modal__footer">
          {rows != null && filtered.length > 0 && (
            <span className="team-rows-modal__footer-count">
              {Math.min(visible, filtered.length).toLocaleString("en-IN")} of{" "}
              {filtered.length.toLocaleString("en-IN")}
            </span>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE)}
              className="btn-primary-cta"
            >
              View {Math.min(PAGE, filtered.length - visible)} more
            </button>
          )}
        </footer>
      </div>

      {selected && (
        <RowDetailModal
          row={selected}
          source={source}
          onUpdated={reload}
          onClose={() => setSelected(null)}
        />
      )}
    </div>,
    document.body,
  );
}
