"use client";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Link as LinkIcon,
  Send,
  SlashSquare,
} from "lucide-react";
import { Avatar, WorkflowStatusPill } from "@/components/ui";
import { formatDate, formatFollowers, formatRupees } from "@/lib/formatters";
import type { OnboardingRow } from "./types";

/** Returns true if this row is a child deliverable (deliverable_index > 1). */
export function isChildRow(r: OnboardingRow): boolean {
  return r.deliverable_index != null && Number(r.deliverable_index) > 1;
}

/**
 * Parent-row detection — mirrors the exact DB filter used by Accounts Hub and
 * Order Status (`.or("deliverable_index.is.null,deliverable_index.eq.1")`).
 * A parent owns the payment and represents the whole collab on the board.
 */
export function isParentRow(r: OnboardingRow): boolean {
  return r.deliverable_index == null || Number(r.deliverable_index) === 1;
}

/** All rows belonging to the same collab (inf_id, collab_number) as `r`. */
export function collabSiblings(
  r: OnboardingRow,
  rows: OnboardingRow[],
): OnboardingRow[] {
  return rows.filter(
    (x) =>
      x &&
      x.inf_id === r.inf_id &&
      Number(x.collab_number ?? 1) === Number(r.collab_number ?? 1),
  );
}

/**
 * Total deliverable count for the whole collab. A multi-deliverable collab is
 * stored as a parent + child rows, so we sum the per-row reels/posts/stories
 * across every sibling. Single-deliverable collabs have just the parent, so
 * this resolves to that row's own count.
 */
export function countCollabDeliverables(
  r: OnboardingRow,
  rows: OnboardingRow[],
): number {
  // Prefer the value precomputed against the full (uncollapsed) row set — the
  // board passes only parent rows to the table, so live sibling summation here
  // would undercount onboarded multi-deliverable collabs (children are hidden).
  if (typeof r._collabDeliverableCount === "number") {
    return r._collabDeliverableCount;
  }
  const siblings = collabSiblings(r, rows);
  const source = siblings.length > 0 ? siblings : [r];
  return source.reduce(
    (sum, row) =>
      sum +
      (row.reels ?? 0) +
      (row.static_posts ?? 0) +
      (row.stories ?? 0),
    0,
  );
}

/**
 * Agreed commercial TOTAL for the whole collab. Each row (parent + children)
 * stores the per-deliverable split share, so summing siblings reconstructs the
 * originally-agreed total — same as Accounts Hub. Returns null when no sibling
 * has a commercial set (e.g. pure Barter).
 */
export function collabCommercialTotal(
  r: OnboardingRow,
  rows: OnboardingRow[],
): number | null {
  if (typeof r._collabCommercialTotal === "number") {
    return r._collabCommercialTotal;
  }
  const siblings = collabSiblings(r, rows);
  const source = siblings.length > 0 ? siblings : [r];
  if (source.every((row) => row.commercial_amount == null)) return null;
  return source.reduce(
    (sum, row) => sum + Number(row.commercial_amount ?? 0),
    0,
  );
}

/** Lookup the parent post_id within the loaded set by (inf_id, collab_number). */
export function findParentPostId(
  r: OnboardingRow,
  rows: OnboardingRow[],
): string {
  for (const row of rows) {
    if (!row) continue;
    if (row.inf_id !== r.inf_id) continue;
    if (Number(row.collab_number ?? 1) !== Number(r.collab_number ?? 1))
      continue;
    if (row.deliverable_index == null || Number(row.deliverable_index) === 1) {
      return row.post_id ?? "";
    }
  }
  return String(r.post_id ?? "").replace(/-P\d+-/, "-P?-");
}

/**
 * Human-readable deliverable count for a single row.
 * "No deliverables" / "1 deliverable" / "{N} deliverables".
 * The complaint was that counts below 2 were invisible — a single-deliverable
 * collab MUST still read "1 deliverable".
 */
export function formatDeliverables(r: OnboardingRow): string {
  return formatDeliverableCount(
    (r.reels ?? 0) + (r.static_posts ?? 0) + (r.stories ?? 0),
  );
}

/** Pluralised "{N} deliverable(s)" from a raw count (collab- or row-level). */
export function formatDeliverableCount(total: number): string {
  if (total <= 0) return "No deliverables";
  if (total === 1) return "1 deliverable";
  return `${total} deliverables`;
}

/** Legacy "2R + 1P + 0S" breakdown — kept as a sub-label / tooltip. */
export function deliverableBreakdown(r: OnboardingRow): string {
  const reels = r.reels ?? 0;
  const posts = r.static_posts ?? 0;
  const stories = r.stories ?? 0;
  return `${reels}R + ${posts}P + ${stories}S`;
}

/**
 * Collab-level breakdown summed across siblings — used as the tooltip on the
 * collapsed parent chip so the per-type detail isn't lost when children hide.
 */
export function collabDeliverableBreakdown(
  r: OnboardingRow,
  rows: OnboardingRow[],
): string {
  if (typeof r._collabDeliverableBreakdown === "string") {
    return r._collabDeliverableBreakdown;
  }
  const siblings = collabSiblings(r, rows);
  const source = siblings.length > 0 ? siblings : [r];
  const totals = source.reduce(
    (acc, row) => {
      acc.reels += row.reels ?? 0;
      acc.posts += row.static_posts ?? 0;
      acc.stories += row.stories ?? 0;
      return acc;
    },
    { reels: 0, posts: 0, stories: 0 },
  );
  return `${totals.reels}R + ${totals.posts}P + ${totals.stories}S`;
}

export function isOverdue(r: OnboardingRow): boolean {
  if (!r.est_delivery) return false;
  if (r.workflow_status === "Posted") return false;
  const d = new Date(r.est_delivery);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export function isOnboarded(r: OnboardingRow): boolean {
  // Any post past "Reach Out" has had its onboarding form submitted —
  // includes On Board, Order Sent, Posted, Delivered, RTO, Cancelled.
  return r.workflow_status != null && r.workflow_status !== "Reach Out";
}

/**
 * Clean collab-level deliverable label — replaces the old Parent/Child/Single
 * lineage wording. Always reads as a human count, e.g. "1 deliverable" or
 * "3 deliverables", computed across the whole collab's siblings.
 */
export function deliverableCountLabel(
  r: OnboardingRow,
  rows: OnboardingRow[],
): string {
  return formatDeliverableCount(countCollabDeliverables(r, rows));
}

/** Email status cell (legacy _emailStatusCell parity). */
export function EmailStatusCell({
  r,
  rows,
  onSend,
}: {
  r: OnboardingRow;
  rows: OnboardingRow[];
  onSend?: (postId: string) => void;
}) {
  if (!isOnboarded(r)) return <span className="text-text-tertiary">—</span>;

  if (isChildRow(r)) {
    const parent = findParentPostId(r, rows);
    return (
      <span
        className="pill pill--linked"
        title={`Email is handled on parent ${parent}`}
      >
        <LinkIcon size={10} aria-hidden />
        Linked
      </span>
    );
  }
  if (r.collab_email_skipped) {
    return (
      <span
        className="pill pill--muted"
        title="Marked as intentionally skipped"
      >
        <SlashSquare size={10} aria-hidden />
        Skipped
      </span>
    );
  }
  if (r.collab_email_sent_at) {
    return (
      <span className="pill pill-success" title="Collab email sent">
        <CheckCircle2 size={10} aria-hidden />
        Sent
      </span>
    );
  }
  return (
    <span className="email-missing-cell">
      <span className="pill pill--danger">
        <AlertTriangle size={10} aria-hidden />
        Missing
      </span>
      {onSend && (
        <button
          type="button"
          className="action-btn action-btn--danger"
          onClick={(e) => {
            e.stopPropagation();
            onSend(r.post_id);
          }}
        >
          <Send size={10} aria-hidden />
          Send Now
        </button>
      )}
    </span>
  );
}

/**
 * Deliverables chip — the clean replacement for the Parent/Child/Single
 * lineage badge. Shows the whole-collab count ("3 deliverables") with the
 * per-type breakdown ("2R + 1P + 0S") as a tooltip. Rendered on the collapsed
 * parent row so a single chip stands in for the entire collab.
 */
export function DeliverablesChip({
  r,
  rows,
}: {
  r: OnboardingRow;
  rows: OnboardingRow[];
}) {
  const count = countCollabDeliverables(r, rows);
  return (
    <span
      className="pill pill--parent"
      title={`Breakdown: ${collabDeliverableBreakdown(r, rows)}`}
    >
      <Layers size={10} aria-hidden />
      {formatDeliverableCount(count)}
    </span>
  );
}

export function CreatorCell({ r }: { r: OnboardingRow }) {
  return (
    <div className="ob-creator-cell">
      <Avatar
        src={r.creator?.profile_pic}
        username={r.creator?.username}
        name={r.creator?.inf_name}
        size={46}
        className="ob-creator-avatar"
      />
      <div className="min-w-0">
        <div className="creator-name">{r.creator?.inf_name ?? "—"}</div>
        <div className="creator-handle">@{r.creator?.username ?? "—"}</div>
      </div>
    </div>
  );
}

/** 11-column legacy parity (Creator, Post ID, Campaign, Stage, Followers,
 *  Collab, Commercials, Deliverables, Order ID, Email, Est. Delivery).
 *  Action column appended by table renderer (uses local modal state). */
export const onboardingColumns: ColumnDef<OnboardingRow>[] = [
  {
    id: "creator",
    accessorFn: (r) => r.creator?.inf_name ?? r.creator?.username ?? "",
    header: "Creator",
    cell: ({ row }) => <CreatorCell r={row.original} />,
  },
  {
    id: "post_id",
    header: "Post ID",
    cell: ({ row }) => (
      <span className="post-id tabular">
        {row.original.post_id_short ?? row.original.post_id}
      </span>
    ),
  },
  {
    id: "campaign",
    accessorFn: (r) => r.campaign?.campaign_id ?? "",
    header: "Campaign",
    cell: ({ row }) =>
      row.original.campaign?.campaign_id ? (
        <span className="campaign-chip">
          {row.original.campaign.campaign_id}
        </span>
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
  {
    id: "stage",
    accessorKey: "workflow_status",
    header: "Stage",
    cell: ({ row }) => (
      <WorkflowStatusPill status={row.original.workflow_status} />
    ),
  },
  {
    id: "followers",
    accessorFn: (r) => r.creator?.followers ?? 0,
    header: "Followers",
    cell: ({ row }) => (
      <span className="tabular">
        {formatFollowers(row.original.creator?.followers)}
      </span>
    ),
  },
  {
    id: "collab",
    accessorKey: "collab_type",
    header: "Collab",
    cell: ({ row }) =>
      row.original.collab_type ?? <span className="text-text-tertiary">—</span>,
  },
  {
    id: "commercials",
    accessorKey: "commercial_amount",
    header: "Commercials",
    cell: ({ row }) => (
      <span className="tabular">
        {(row.original._collabCommercialTotal ??
          row.original.commercial_amount) != null
          ? formatRupees(
              row.original._collabCommercialTotal ??
                (row.original.commercial_amount as number),
            )
          : "—"}
      </span>
    ),
  },
  {
    id: "deliverables",
    header: "Deliverables",
    cell: ({ row, table }) => {
      const rows = table.options.data as OnboardingRow[];
      return (
        <span className="inline-flex flex-col items-start gap-0.5">
          <DeliverablesChip r={row.original} rows={rows} />
          <span className="tabular text-[0.66rem] text-text-tertiary whitespace-nowrap">
            {collabDeliverableBreakdown(row.original, rows)}
          </span>
        </span>
      );
    },
  },
  {
    id: "nomenclature",
    header: "Nomenclature",
    cell: ({ row }) => {
      const value =
        row.original.nomenclature ?? row.original.content_type ?? "—";
      return (
        <span className="ob-nomenclature-cell" title={String(value)}>
          {value}
        </span>
      );
    },
  },
  {
    id: "order_id",
    header: "Order ID",
    cell: ({ row }) =>
      row.original.order_id ? (
        <span
          className="post-id tabular"
          style={{ color: "var(--color-success-text)" }}
        >
          {row.original.order_id}
        </span>
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
  {
    id: "email",
    header: "Email",
    cell: ({ row, table }) => (
      <EmailStatusCell
        r={row.original}
        rows={table.options.data as OnboardingRow[]}
      />
    ),
  },
  {
    id: "est_delivery",
    accessorKey: "est_delivery",
    header: "Est. Delivery",
    cell: ({ row }) => (
      <span className="tabular whitespace-nowrap text-[0.78rem]">
        {formatDate(row.original.est_delivery) ?? "—"}
        {isOverdue(row.original) && (
          <span
            className="ob-list-overdue"
            title="Estimated delivery date has passed and this post is not marked Posted yet."
            aria-label="Estimated delivery date has passed and this post is not marked Posted yet."
            tabIndex={0}
          >
            <AlertTriangle size={11} aria-hidden />
          </span>
        )}
      </span>
    ),
  },
];
