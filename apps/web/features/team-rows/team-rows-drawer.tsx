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
  Play,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { proxyAvatarUrl } from "@/lib/formatters";
import { extractShortcode } from "@/lib/instagram-shortcode";
import { fetchTeamRows, type TeamRow } from "./actions";

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
const STAGE_FILTERS: Array<{ key: Stage | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "reach", label: "Reach Out" },
  { key: "onboard", label: "Onboard" },
  { key: "posted", label: "Posted" },
  { key: "delivered", label: "Delivered" },
  { key: "closed", label: "RTO / Cancelled" },
];

const PAGE = 30;
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

// ── Instagram post preview (thumbnail button → live embed lightbox) ────────
function PostPreview({ link, label }: { link: string | null; label: string }) {
  const shortcode = extractShortcode(link ?? "");
  const [open, setOpen] = useState(false);
  if (!shortcode) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#2C2420] text-[#F0C61E] px-2.5 py-1 text-[0.62rem] font-extrabold hover:scale-[1.03] transition-transform shrink-0"
        title="Play the post"
      >
        <Play size={11} aria-hidden /> Preview
      </button>
      {open && <PostLightbox shortcode={shortcode} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function PostLightbox({
  shortcode,
  label,
  onClose,
}: {
  shortcode: string;
  label: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`Post preview — ${label}`}
      style={{ zIndex: 90 }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal-panel modal-panel--onboarding"
        style={{ maxWidth: 420, width: "94vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head" style={{ paddingBottom: 8 }}>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.06em] text-text-secondary">
              <Instagram size={12} aria-hidden /> Live Instagram embed
            </span>
            <h2 className="text-sm font-extrabold text-text-primary truncate">{label}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} aria-hidden />
          </button>
        </header>
        <div className="modal-body" style={{ padding: 0 }}>
          <iframe
            src={`https://www.instagram.com/p/${shortcode}/embed/captioned/`}
            title="Instagram post preview"
            loading="lazy"
            allow="encrypted-media; clipboard-write; picture-in-picture; fullscreen"
            allowFullScreen
            style={{ width: "100%", height: 560, border: 0, background: "#fff" }}
          />
        </div>
        <div className="p-3 text-end">
          <a
            href={`https://www.instagram.com/p/${shortcode}/`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[0.68rem] font-extrabold text-[#3B6FD4] hover:underline"
          >
            <ExternalLink size={12} aria-hidden /> Open on Instagram
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Row card ────────────────────────────────────────────────────────────────
function RowCard({ row, onOpen }: { row: TeamRow; onOpen: () => void }) {
  const stage = stageOf(row);
  const meta = STAGE_META[stage];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "team-row-card w-full min-w-0 text-left",
        "flex items-center gap-3 rounded-2xl border border-border",
        "bg-bg-white p-2.5 transition-all hover:border-[#DCD6C4]",
        "hover:shadow-sm sm:p-3",
      )}
    >
      <Avatar
        src={proxyAvatarUrl(row.profile_pic, 88)}
        username={row.username}
        name={row.username}
        size={44}
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
        </div>
        <div className="text-[0.8rem] font-extrabold text-text-primary truncate mt-0.5">
          @{row.username ?? "—"}
        </div>
        <div className="text-[0.6rem] text-text-tertiary truncate">
          {row.influencer_category ?? "—"} · {fmtNum(row.followers)} followers ·{" "}
          {row.content_type ?? "—"}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[0.58rem] text-text-tertiary">
          {fmtDate(row.post_date ?? row.reach_out_date)}
        </span>
        <PostPreview link={row.post_link} label={row.username ?? row.post_id_short ?? ""} />
      </div>
    </button>
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

function RowDetailModal({ row, onClose }: { row: TeamRow; onClose: () => void }) {
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
      style={{ zIndex: 80 }}
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
            <PostPreview link={row.post_link} label={row.username ?? ""} />
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
          <section className="campaign-detail-overview ad-detail-overview">
            <div className="campaign-detail-allocation-card ad-detail-profile-card">
              <div className="ad-detail-avatar-frame">
                <Avatar
                  src={proxyAvatarUrl(row.profile_pic, 116)}
                  username={row.username}
                  name={row.username}
                  size={74}
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
}: {
  team: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<Stage | "all">("all");
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<TeamRow | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchTeamRows(team).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [team]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !selected && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selected]);
  useEffect(() => setVisible(PAGE), [q, stage]);

  const filtered = useMemo(() => {
    const src = rows ?? [];
    const ql = q.trim().toLowerCase();
    return src.filter((r) => {
      if (stage !== "all" && stageOf(r) !== stage) return false;
      if (!ql) return true;
      return (
        (r.username ?? "").toLowerCase().includes(ql) ||
        (r.post_id_short ?? "").toLowerCase().includes(ql) ||
        (r.campaign_id ?? "").toLowerCase().includes(ql) ||
        (r.order_id ?? "").toLowerCase().includes(ql)
      );
    });
  }, [rows, q, stage]);

  if (!mounted || typeof document === "undefined") return null;
  const visibleRows = filtered.slice(0, visible);
  const hasMore = rows != null && filtered.length > visible;

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--onboarding"
      role="dialog"
      aria-modal="true"
      aria-label={`${team} — rows`}
      style={{ zIndex: 70 }}
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

      {selected && <RowDetailModal row={selected} onClose={() => setSelected(null)} />}
    </div>,
    document.body,
  );
}
