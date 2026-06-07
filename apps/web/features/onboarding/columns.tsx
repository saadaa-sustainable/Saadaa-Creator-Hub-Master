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

/**
 * Collab grouping key — prefer the stamped collab_id (SIF-1-C1), fall back to
 * inf_id||'-C'||collab_number for legacy rows, then post_id so a lone row still
 * forms its own group. All deliverables of one collab share this key.
 */
export function collabKeyOf(r: OnboardingRow): string {
  if (r.collab_id) return r.collab_id;
  if (r.inf_id) return `${r.inf_id}-C${Number(r.collab_number ?? 1)}`;
  return r.post_id ?? "";
}

/** Display-friendly Collab ID (the stamped collab_id, with legacy fallback). */
export function collabIdLabel(r: OnboardingRow): string {
  return collabKeyOf(r);
}

/** All deliverable rows belonging to the same collab_id as `r`. */
export function collabSiblings(
  r: OnboardingRow,
  rows: OnboardingRow[],
): OnboardingRow[] {
  const key = collabKeyOf(r);
  return rows.filter((x) => x && collabKeyOf(x) === key);
}

/**
 * Representative-row detection for the collab_id model — the board renders ONE
 * row per collab_id. The representative is the deliverable with the lowest
 * post_id within its collab group. Replaces the old parent/child (deliverable_
 * index) test entirely.
 */
export function isCollabRepresentative(
  r: OnboardingRow,
  rows: OnboardingRow[],
): boolean {
  const key = collabKeyOf(r);
  const mine = String(r.post_id ?? "");
  for (const x of rows) {
    if (!x || collabKeyOf(x) !== key) continue;
    if (String(x.post_id ?? "") < mine) return false;
  }
  return true;
}

/** True when `r` is NOT the collab representative (email/payment live on the rep). */
export function isLinkedDeliverable(
  r: OnboardingRow,
  rows: OnboardingRow[],
): boolean {
  return !isCollabRepresentative(r, rows);
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
  // Stories ARE deliverables (they count), they just don't generate a separate
  // post_id/asset row — so they're included in the count.
  return source.reduce(
    (sum, row) =>
      sum + (row.reels ?? 0) + (row.static_posts ?? 0) + (row.stories ?? 0),
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

/**
 * The representative deliverable's post_id within the collab group (the row that
 * carries the collab email + payment). Lowest post_id in the collab_id group.
 */
export function findRepresentativePostId(
  r: OnboardingRow,
  rows: OnboardingRow[],
): string {
  const key = collabKeyOf(r);
  let rep: string | null = null;
  for (const row of rows) {
    if (!row || collabKeyOf(row) !== key) continue;
    const pid = String(row.post_id ?? "");
    if (rep == null || pid < rep) rep = pid;
  }
  return rep ?? String(r.post_id ?? "");
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

/** "1P : 1R" breakdown — Static Posts : Reels (: Stories only when present).
 *  Stories count as deliverables but never generate a post_id/asset row. */
export function deliverableBreakdown(r: OnboardingRow): string {
  const reels = r.reels ?? 0;
  const posts = r.static_posts ?? 0;
  const stories = r.stories ?? 0;
  return `${posts}P : ${reels}R${stories > 0 ? ` : ${stories}S` : ""}`;
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
  return `${totals.posts}P : ${totals.reels}R${
    totals.stories > 0 ? ` : ${totals.stories}S` : ""
  }`;
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

  if (isLinkedDeliverable(r, rows)) {
    const rep = findRepresentativePostId(r, rows);
    return (
      <span
        className="pill pill--linked"
        title={`Email is handled on the collab's primary deliverable ${rep}`}
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

/** Column order: Creator, Post ID, Collab ID, INF ID, Campaign, Stage,
 *  Followers, Collab, Commercials, Deliverables, Nomenclature, Order ID,
 *  Email, Est. Delivery. Action column appended by table renderer. */
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
    id: "collab_id",
    header: "Collab ID",
    cell: ({ row }) => (
      <span
        className="campaign-chip tabular"
        title="Groups all deliverables of this collaboration"
      >
        {collabIdLabel(row.original)}
      </span>
    ),
  },
  {
    id: "inf_id",
    header: "INF ID",
    accessorFn: (r) => r.inf_id ?? r.creator?.inf_id ?? "",
    cell: ({ row }) => (
      <span className="tabular text-[0.78rem]">
        {row.original.inf_id ?? row.original.creator?.inf_id ?? "—"}
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
    cell: ({ row, table }) => (
      <span className="text-[0.78rem] text-text-secondary tabular whitespace-nowrap">
        {collabDeliverableBreakdown(
          row.original,
          table.options.data as OnboardingRow[],
        )}
      </span>
    ),
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
