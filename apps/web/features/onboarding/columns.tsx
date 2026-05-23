"use client";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Link as LinkIcon,
  Network,
  Send,
  SlashSquare,
  Star,
} from "lucide-react";
import { Avatar, WorkflowStatusPill } from "@/components/ui";
import { formatDate, formatFollowers, formatRupees } from "@/lib/formatters";
import type { OnboardingRow } from "./types";

/** Returns true if this row is a child deliverable (deliverable_index > 1). */
export function isChildRow(r: OnboardingRow): boolean {
  return r.deliverable_index != null && Number(r.deliverable_index) > 1;
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

/** "2R + 1P + 0S" deliverables string (legacy parity). */
export function formatDeliverables(r: OnboardingRow): string {
  const reels = r.reels ?? 0;
  const posts = r.static_posts ?? 0;
  const stories = r.stories ?? 0;
  return `${reels}R + ${posts}P + ${stories}S`;
}

export function isOverdue(r: OnboardingRow): boolean {
  if (!r.est_delivery) return false;
  if (r.workflow_status === "Posted") return false;
  const d = new Date(r.est_delivery);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export function isOnboarded(r: OnboardingRow): boolean {
  return r.workflow_status === "On Board" || r.workflow_status === "Order Sent";
}

export function lineageLabel(r: OnboardingRow, rows: OnboardingRow[]): string {
  if (isChildRow(r)) return `Child ${Number(r.deliverable_index ?? 0)}`;
  const hasSiblings = rows.some(
    (x) =>
      x &&
      x.inf_id === r.inf_id &&
      Number(x.collab_number ?? 1) === Number(r.collab_number ?? 1) &&
      Number(x.deliverable_index ?? 0) > 1,
  );
  return hasSiblings ? "Parent" : "Single";
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

/** Lineage badge — Child of {parent} or Parent (when has siblings). */
export function LineageBadge({
  r,
  rows,
}: {
  r: OnboardingRow;
  rows: OnboardingRow[];
}) {
  if (isChildRow(r)) {
    const parent = findParentPostId(r, rows);
    return (
      <span
        className="pill pill--child"
        title={`Additional deliverable for parent ${parent}`}
      >
        <Network size={10} aria-hidden />
        Child {Number(r.deliverable_index ?? 0)}
      </span>
    );
  }
  const hasSiblings = rows.some(
    (x) =>
      x &&
      x.inf_id === r.inf_id &&
      Number(x.collab_number ?? 1) === Number(r.collab_number ?? 1) &&
      Number(x.deliverable_index ?? 0) > 1,
  );
  if (hasSiblings) {
    return (
      <span
        className="pill pill--parent"
        title="Primary deliverable for this collab"
      >
        <Star size={10} aria-hidden />
        Parent
      </span>
    );
  }
  return null;
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
    id: "lineage",
    header: "Lineage",
    cell: ({ row, table }) => (
      <LineageBadge
        r={row.original}
        rows={table.options.data as OnboardingRow[]}
      />
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
        {row.original.commercial_amount != null
          ? formatRupees(row.original.commercial_amount)
          : "—"}
      </span>
    ),
  },
  {
    id: "deliverables",
    header: "Deliverables",
    cell: ({ row }) => (
      <span className="text-[0.78rem] text-text-secondary tabular whitespace-nowrap">
        {formatDeliverables(row.original)}
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
