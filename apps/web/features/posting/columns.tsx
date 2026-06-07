"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Download, ExternalLink, Layers } from "lucide-react";
import { Avatar, PartnershipKeyEdit, WorkflowStatusPill } from "@/components/ui";
import { formatDate, formatFollowers } from "@/lib/formatters";
import type { PostingRow } from "./types";

/** Posted rows are read-only — submit hidden, links shown. */
export function isPosted(r: PostingRow): boolean {
  return r.workflow_status === "Posted";
}

/**
 * Collab grouping key — prefer the stamped collab_id (SIF-1-C1), fall back to
 * inf_id||'-C'||collab_number for legacy rows, then post_id. All deliverables
 * of one collab share this key. Replaces the old parent/child grouping.
 */
export function collabKeyOf(r: PostingRow): string {
  if (r.collab_id) return r.collab_id;
  if (r.inf_id) return `${r.inf_id}-C${Number(r.collab_number ?? 1)}`;
  return r.post_id ?? "";
}

/** Display-friendly Collab ID. */
export function collabIdLabel(r: PostingRow): string {
  return collabKeyOf(r);
}

/** Count of deliverables sharing this row's collab_id within the loaded set. */
export function collabDeliverableCount(
  r: PostingRow,
  rows: PostingRow[],
): number {
  const key = collabKeyOf(r);
  return rows.filter((x) => x && collabKeyOf(x) === key).length;
}

/** "1P : 1R" — Static Posts : Reels (: Stories only when present). Stories
 *  count as deliverables but never generate a post_id/asset row. */
export function formatDeliverables(r: PostingRow): string {
  const reels = r.reels ?? 0;
  const posts = r.static_posts ?? 0;
  const stories = r.stories ?? 0;
  return `${posts}P : ${reels}R${stories > 0 ? ` : ${stories}S` : ""}`;
}

/**
 * Post ID pill for the card. Renders the post_id alone — collab_id is carried by
 * the adjacent CollabIdBadge chip, so no inline collab secondary is shown here
 * (avoids displaying the same collab_id twice in the card pill row).
 */
export function PostIdWithCollab({ r }: { r: PostingRow }) {
  return (
    <span className="post-id-cell">
      <span className="post-id tabular">{r.post_id_short ?? r.post_id}</span>
    </span>
  );
}

/** Collab ID chip — groups all deliverables of a collaboration. */
export function CollabIdBadge({
  r,
  rows,
}: {
  r: PostingRow;
  rows: PostingRow[];
}) {
  const count = collabDeliverableCount(r, rows);
  return (
    <span
      className="campaign-chip tabular inline-flex items-center gap-1 leading-none whitespace-nowrap"
      title={
        count > 1
          ? `${count} deliverables share this Collab ID`
          : "Collab ID — groups all deliverables of this collaboration"
      }
    >
      {count > 1 && <Layers size={10} aria-hidden className="shrink-0" />}
      {collabIdLabel(r)}
    </span>
  );
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

/** Column order: Creator | Post ID | Collab ID | INF ID | Campaign |
 *  Deliverables | Ads Rights | Partnership Key | Stage | Followers | Onboarded |
 *  Post Date | Live Link | Drive. Action appended by table. */
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
    // Plain post_id only — the dedicated Collab ID column carries collab_id now,
    // so no inline secondary line is rendered here.
    cell: ({ row }) => (
      <span className="post-id tabular">
        {row.original.post_id_short ?? row.original.post_id}
      </span>
    ),
  },
  {
    id: "collab_id",
    header: "Collab ID",
    cell: ({ row, table }) => (
      <CollabIdBadge
        r={row.original}
        rows={table.options.data as PostingRow[]}
      />
    ),
  },
  {
    id: "inf_id",
    accessorFn: (r) => r.inf_id ?? "",
    header: "INF ID",
    cell: ({ row }) =>
      row.original.inf_id ? (
        <span className="tabular text-[0.78rem] text-text-secondary">
          {row.original.inf_id}
        </span>
      ) : (
        <span className="text-text-tertiary">—</span>
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
