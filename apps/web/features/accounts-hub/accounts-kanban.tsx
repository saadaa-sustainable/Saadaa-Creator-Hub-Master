"use client";
import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Avatar, PartnershipKeyEdit } from "@/components/ui";
import { formatRupees } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { AccountsOverviewModal } from "./accounts-overview-modal";
import {
  AdsPartnershipPill,
  AmountCell,
  DueDateCell,
  EstPayableCell,
  MatchStatusPill,
  PaymentDateCell,
  PaymentStatusPill,
  PostedNotTestedPill,
  RemainderPill,
  UtrCell,
} from "./columns";
import { KANBAN_COLUMNS, type AccountsRow } from "./types";

/**
 * Accounts Hub Kanban — 3-column board (Reach Out / On Board / Posted).
 * Mirrors legacy markup at Index.html:7001-7034 + card render
 * `_accKbCardHtml` (InfluencerBackend / handler script).
 */
export function AccountsKanban({ rows }: { rows: AccountsRow[] }) {
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  const bucketed = useMemo(() => {
    const map = new Map<string, AccountsRow[]>();
    for (const col of KANBAN_COLUMNS) map.set(col.id, []);
    for (const row of rows) {
      const status = String(row.workflow_status ?? "");
      const col = KANBAN_COLUMNS.find((c) =>
        (c.statuses as readonly string[]).includes(status),
      );
      if (!col) continue;
      // Collab ID model: `rows` already arrive collapsed to ONE representative
      // per collab_id from fetchAccountsHubData — no child-skip needed.
      map.get(col.id)!.push(row);
    }
    return map;
  }, [rows]);

  return (
    <>
      <div className="acc-kanban">
        {KANBAN_COLUMNS.map((col) => {
          const items = bucketed.get(col.id) ?? [];
          return (
            <section
              key={col.id}
              className="acc-kb-col"
              aria-label={col.label}
            >
              <header className="acc-kb-col__head">
                <span className="acc-kb-col__title">{col.label}</span>
                <span className="acc-kb-col__count tabular">
                  {items.length}
                </span>
              </header>
              <div className="acc-kb-col__body">
                {items.length === 0 ? (
                  <div className="acc-kb-col__empty">
                    No posts in this stage.
                  </div>
                ) : (
                  items.map((row) => {
                    const totalDeliverables = row._collabDeliverableCount ?? 1;
                    return (
                      <KanbanCard
                        key={row.post_id}
                        row={row}
                        totalDeliverables={totalDeliverables}
                        onOpen={() => setOpenPostId(row.post_id)}
                      />
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {openPostId && (
        <AccountsOverviewModal
          postId={openPostId}
          onClose={() => setOpenPostId(null)}
        />
      )}
    </>
  );
}

function KanbanCard({
  row,
  totalDeliverables,
  onOpen,
}: {
  row: AccountsRow;
  totalDeliverables: number;
  onOpen: () => void;
}) {
  const paid = row.payment?.status === "Done";
  const isPostedStage = ["Posted", "Delivered"].includes(
    String(row.workflow_status ?? ""),
  );
  // Collab ID (legacy fallback to inf_id||'-C'||collab_number).
  const collabId =
    row.collab_id ??
    (row.inf_id ? `${row.inf_id}-C${Number(row.collab_number ?? 1)}` : null);
  const splitAmount =
    totalDeliverables > 0
      ? Number(row.commercial_amount ?? 0) / totalDeliverables
      : Number(row.commercial_amount ?? 0);

  return (
    <article
      role="button"
      tabIndex={0}
      className={cn("acc-kb-card", paid && "acc-kb-card--paid")}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <header className="acc-kb-card__head">
        <Avatar
          src={row.creator?.profile_pic}
          username={row.creator?.username}
          name={row.creator?.inf_name}
          size={36}
        />
        <div className="acc-kb-card__identity">
          <strong className="acc-kb-card__name">
            {row.creator?.inf_name ?? row.creator?.username ?? "—"}
          </strong>
          {row.creator?.username && (
            <span className="acc-kb-card__handle">
              @{row.creator.username}
            </span>
          )}
        </div>
        <PaymentStatusPill status={row.payment?.status} />
      </header>

      <div className="acc-kb-card__chips">
        <span className="post-id tabular">
          {row.post_id_short ?? row.post_id}
        </span>
        {collabId && (
          <span
            className="campaign-chip tabular"
            title="Collab ID — groups all deliverables of this collaboration"
          >
            {collabId}
          </span>
        )}
        {row.campaign?.campaign_id && (
          <span className="campaign-chip">{row.campaign.campaign_id}</span>
        )}
        {isPostedStage && totalDeliverables > 1 && (
          <span
            className="pill pill--muted"
            title={`${totalDeliverables} deliverables share this Collab ID`}
          >
            <Layers size={10} aria-hidden />
            {totalDeliverables} delivs
          </span>
        )}
        <AdsPartnershipPill row={row} />
        <PostedNotTestedPill row={row} />
        <RemainderPill row={row} />
        <MatchStatusPill row={row} />
      </div>

      {isPostedStage &&
        (row.ads_usage_rights ?? "").trim().length > 0 && (
          <div
            className="acc-kb-card__pk"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="acc-kb-card__pk-label">Partnership Key</span>
            <PartnershipKeyEdit
              postId={row.post_id!}
              value={row.partnership_id}
              stopPropagation
              compact
              readOnly
            />
          </div>
        )}

      <dl className="acc-kb-card__meta">
        <div>
          <dt>Amount</dt>
          <dd>
            <AmountCell row={row} />
            {isPostedStage && totalDeliverables > 1 && (
              <div className="acc-kb-card__split tabular">
                {formatRupees(splitAmount)} × {totalDeliverables}
              </div>
            )}
          </dd>
        </div>
        <div>
          <dt>UTR</dt>
          <dd>
            <UtrCell row={row} />
          </dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>
            <DueDateCell row={row} />
          </dd>
        </div>
        <div>
          <dt>Est. Payable</dt>
          <dd>
            <EstPayableCell row={row} />
          </dd>
        </div>
      </dl>

      {paid && (
        <footer className="acc-kb-card__paid">
          <span>Paid on</span>
          <PaymentDateCell row={row} />
        </footer>
      )}

      {!paid && row.barter_amount != null && Number(row.barter_amount) > 0 && (
        <footer className="acc-kb-card__barter">
          <span>Barter</span>
          <strong className="tabular">
            {formatRupees(Number(row.barter_amount))}
          </strong>
        </footer>
      )}
    </article>
  );
}
