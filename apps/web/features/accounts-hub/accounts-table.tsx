"use client";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Avatar, PartnershipKeyEdit } from "@/components/ui";
import { formatDate } from "@/lib/formatters";
import {
  AdsPartnershipPill,
  AmountCell,
  CreatorCell,
  DueDateCell,
  EstPayableCell,
  MatchStatusPill,
  PaymentDateCell,
  PaymentStatusPill,
  UtrCell,
} from "./columns";
import type { AccountsRow } from "./types";

/**
 * Accounts Hub list view — flat table, Posted/Delivered scope only.
 * Legacy parity: Index.html:7036-7058 cols.
 */
export function AccountsTable({ rows }: { rows: AccountsRow[] }) {
  const postedRows = useMemo(
    () =>
      rows.filter((r) =>
        ["Posted", "Delivered"].includes(String(r.workflow_status ?? "")),
      ),
    [rows],
  );

  const columns = useMemo<ColumnDef<AccountsRow>[]>(
    () => [
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
        id: "creator",
        accessorFn: (r) => r.creator?.inf_name ?? r.creator?.username ?? "",
        header: "Influencer",
        cell: ({ row }) => <CreatorCell row={row.original} />,
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
        id: "amount",
        accessorFn: (r) => r.payment?.amount ?? r.commercial_amount ?? 0,
        header: "Amount",
        cell: ({ row }) => <AmountCell row={row.original} />,
      },
      {
        id: "utr",
        header: "UTR",
        cell: ({ row }) => <UtrCell row={row.original} />,
      },
      {
        id: "status",
        accessorFn: (r) => r.payment?.status ?? "",
        header: "Status",
        cell: ({ row }) => (
          <span className="acc-status-stack">
            <PaymentStatusPill status={row.original.payment?.status} />
            <MatchStatusPill row={row.original} />
            <AdsPartnershipPill row={row.original} />
          </span>
        ),
      },
      {
        id: "due_date",
        accessorFn: (r) => r.payment?.due_date ?? "",
        header: "Due Date",
        cell: ({ row }) => <DueDateCell row={row.original} />,
      },
      {
        id: "est_payable",
        accessorFn: (r) => r.payment?.estimated_payable_date ?? "",
        header: "Est. Payable",
        cell: ({ row }) => <EstPayableCell row={row.original} />,
      },
      {
        id: "payment_date",
        accessorFn: (r) => r.payment?.payment_date ?? "",
        header: "Payment Date",
        cell: ({ row }) => <PaymentDateCell row={row.original} />,
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
              readOnly
            />
          ) : (
            <span className="text-text-tertiary text-xs">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="ob-list-wrap">
      <DataTable<AccountsRow>
        data={postedRows}
        columns={columns}
        rowClassName={(r) =>
          r.payment?.status === "Done" ? "acc-list-row--paid" : undefined
        }
        emptyTitle="No payable posts yet"
        emptyDescription="Rows appear here once posts flip to Posted or Delivered."
        mobileCard={(r) => <AccountsListMobileCard row={r} />}
      />
    </div>
  );
}

function AccountsListMobileCard({ row }: { row: AccountsRow }) {
  return (
    <div className="acc-list-mobile-card">
      <div className="acc-list-mobile-card__head">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar
            src={row.creator?.profile_pic}
            username={row.creator?.username}
            name={row.creator?.inf_name}
            size={24}
          />
          <div className="min-w-0">
            <div className="font-medium truncate text-[0.82rem] leading-tight">
              {row.creator?.inf_name ?? row.creator?.username ?? "—"}
            </div>
            <div className="text-[0.65rem] text-text-tertiary tabular truncate leading-tight">
              {row.post_id_short ?? row.post_id}
            </div>
          </div>
        </div>
        <PaymentStatusPill status={row.payment?.status} />
      </div>
      <dl className="acc-list-mobile-card__meta">
        <dt>Campaign</dt>
        <dd>{row.campaign?.campaign_id ?? "—"}</dd>
        <dt>Amount</dt>
        <dd>
          <AmountCell row={row} />
        </dd>
        <dt>UTR</dt>
        <dd>
          <UtrCell row={row} />
        </dd>
        <dt>Due</dt>
        <dd>{formatDate(row.payment?.due_date)}</dd>
        <dt>Est. Payable</dt>
        <dd>
          <EstPayableCell row={row} />
        </dd>
        <dt>Payment Date</dt>
        <dd>
          <PaymentDateCell row={row} />
        </dd>
      </dl>
      <div className="flex flex-wrap gap-0.5 mt-0.5">
        <MatchStatusPill row={row} />
        <AdsPartnershipPill row={row} />
      </div>
      {(row.ads_usage_rights ?? "").trim() && (
        <div className="acc-list-mobile-card__pk">
          <span className="acc-list-mobile-card__pk-label">Partnership Key</span>
          <PartnershipKeyEdit postId={row.post_id!} value={row.partnership_id} compact readOnly />
        </div>
      )}
    </div>
  );
}
