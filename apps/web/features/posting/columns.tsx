"use client";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Network,
  Star,
} from "lucide-react";
import { Avatar, PartnershipKeyEdit, WorkflowStatusPill } from "@/components/ui";
import { formatDate, formatFollowers } from "@/lib/formatters";
import type { PostingRow } from "./types";

/** Posted rows are read-only — submit hidden, links shown. */
export function isPosted(r: PostingRow): boolean {
  return r.workflow_status === "Posted";
}

/** Child deliverable (deliverable_index > 1). */
export function isChildRow(r: PostingRow): boolean {
  return r.deliverable_index != null && Number(r.deliverable_index) > 1;
}

/** Lookup parent post_id within the loaded set by (inf_id, collab_number). */
export function findParentPostId(r: PostingRow, rows: PostingRow[]): string {
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

/** "2R + 1P + 0S" — legacy parity. */
export function formatDeliverables(r: PostingRow): string {
  const reels = r.reels ?? 0;
  const posts = r.static_posts ?? 0;
  const stories = r.stories ?? 0;
  return `${reels}R + ${posts}P + ${stories}S`;
}

export function lineageLabel(r: PostingRow, rows: PostingRow[]): string {
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

export function LineageBadge({
  r,
  rows,
}: {
  r: PostingRow;
  rows: PostingRow[];
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

export function CreatorCell({ r }: { r: PostingRow }) {
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

/** Live post URL cell — external link, "—" when missing. */
export function PostLinkCell({ url }: { url?: string | null }) {
  if (!url) return <span className="text-text-tertiary">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="text-link inline-flex items-center gap-1 text-xs"
    >
      Open <ExternalLink size={11} aria-hidden />
    </a>
  );
}

/** Drive download link cell. */
export function DriveLinkCell({ url }: { url?: string | null }) {
  if (!url) return <span className="text-text-tertiary">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="text-link inline-flex items-center gap-1 text-xs"
    >
      <Download size={11} aria-hidden />
      Drive
    </a>
  );
}

/** Ads rights pill — danger highlight when "Yes" + missing download link. */
export function AdsRightsCell({ r }: { r: PostingRow }) {
  const required = r.ads_usage_rights === "Yes";
  const missingDrive = required && !r.download_link;
  if (!r.ads_usage_rights) {
    return <span className="text-text-tertiary">—</span>;
  }
  return (
    <span
      className={
        required
          ? missingDrive
            ? "pill pill--danger"
            : "pill pill-success"
          : "pill pill--muted"
      }
      title={
        missingDrive
          ? "Ads Usage Rights = Yes but no Drive download link yet."
          : undefined
      }
    >
      {missingDrive && <AlertTriangle size={10} aria-hidden />}
      {r.ads_usage_rights}
    </span>
  );
}

/** 9-column legacy parity (Creator|Post ID|Lineage|Campaign|Deliverables|Ads
 *  Rights|Stage|Onboarded|Post Date|Live Link|Drive). Action appended by table. */
export const postingColumns: ColumnDef<PostingRow>[] = [
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
        rows={table.options.data as PostingRow[]}
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
    id: "deliverables",
    header: "Deliverables",
    cell: ({ row }) => (
      <span className="text-[0.78rem] text-text-secondary tabular whitespace-nowrap">
        {formatDeliverables(row.original)}
      </span>
    ),
  },
  {
    id: "ads_rights",
    accessorKey: "ads_usage_rights",
    header: "Ads Rights",
    cell: ({ row }) => <AdsRightsCell r={row.original} />,
  },
  {
    id: "partnership_key",
    accessorFn: (r) => r.partnership_id ?? "",
    header: "Partnership Key",
    cell: ({ row }) =>
      (row.original.ads_usage_rights ?? "").trim() ? (
        <PartnershipKeyEdit
          postId={row.original.post_id!}
          value={row.original.partnership_id}
          isPosted={isPosted(row.original)}
        />
      ) : (
        <span className="text-text-tertiary text-xs">—</span>
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
    id: "onboard_date",
    accessorKey: "onboard_date",
    header: "Onboarded",
    cell: ({ row }) => (
      <span className="tabular whitespace-nowrap text-[0.78rem] text-text-tertiary">
        {formatDate(row.original.onboard_date)}
      </span>
    ),
  },
  {
    id: "post_date",
    accessorKey: "post_date",
    header: "Post Date",
    cell: ({ row }) => (
      <span className="tabular whitespace-nowrap text-[0.78rem]">
        {formatDate(row.original.post_date)}
      </span>
    ),
  },
  {
    id: "post_link",
    header: "Live Link",
    cell: ({ row }) => <PostLinkCell url={row.original.post_link} />,
  },
  {
    id: "download_link",
    header: "Drive",
    cell: ({ row }) => <DriveLinkCell url={row.original.download_link} />,
  },
];
