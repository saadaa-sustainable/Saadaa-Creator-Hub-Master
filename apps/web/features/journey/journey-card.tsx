import { Avatar } from "@/components/ui/avatar";
import { formatDate, formatFollowers } from "@/lib/formatters";
import type { JourneyCard as JourneyCardType, JourneyColumnId } from "./types";
import { cn } from "@/lib/cn";
import { journeyCollabId } from "./collab-id";

/** Date field to show per column — mirrors legacy card_foot logic. */
function resolveDate(
  card: JourneyCardType,
  colId: JourneyColumnId,
): { label: string; value: string | null } {
  switch (colId) {
    case "reach-out":
      return { label: "Reached", value: card.reach_out_date };
    case "on-board":
      return { label: "Onboarded", value: card.onboard_date };
    case "posted":
      return { label: "Posted", value: card.post_date };
    case "payment":
      return { label: "Posted", value: card.post_date };
  }
}

/** Status chip tone derived from order_status. */
function orderStatusChip(orderStatus: string | null): {
  bg: string;
  text: string;
  label: string;
} | null {
  if (!orderStatus) return null;
  const s = orderStatus.trim().toLowerCase();
  if (s === "delivered")
    return {
      bg: "var(--success-bg)",
      text: "var(--success-text)",
      label: "Delivered",
    };
  if (s === "rto" || s.startsWith("rto"))
    return {
      bg: "var(--danger-bg)",
      text: "var(--danger-text)",
      label: orderStatus,
    };
  if (s === "cancelled" || s.includes("cancel"))
    return {
      bg: "var(--danger-bg)",
      text: "var(--danger-text)",
      label: "Cancelled",
    };
  if (s === "in transit" || s === "shipped" || s === "dispatched")
    return {
      bg: "var(--warning-bg)",
      text: "var(--warning-text)",
      label: orderStatus,
    };
  // Pending / processing / etc.
  return {
    bg: "var(--bg-surface)",
    text: "var(--text-secondary)",
    label: orderStatus,
  };
}

/** Payment status pill shown on Payment column cards. */
function paymentChip(paymentStatus: string | null): {
  bg: string;
  text: string;
  label: string;
} {
  const s = (paymentStatus ?? "").trim().toLowerCase();
  if (s === "done" || s === "paid") {
    return {
      bg: "var(--success-bg)",
      text: "var(--success-text)",
      label: "Settled",
    };
  }
  return {
    bg: "var(--warning-bg)",
    text: "var(--warning-text)",
    label: "Payment pending",
  };
}

export function JourneyCardItem({
  card,
  colId,
  onClick,
}: {
  card: JourneyCardType;
  colId: JourneyColumnId;
  onClick?: () => void;
}) {
  const dateField = resolveDate(card, colId);
  const orderChip = orderStatusChip(card.order_status);
  const displayName = card.inf_name ?? card.username ?? "—";
  const handle = card.username ?? undefined;

  const payChip = colId === "payment" ? paymentChip(card.payment_status) : null;
  const collabId = journeyCollabId(card);

  return (
    <article
      className="rounded-xl bg-bg-white border border-border p-2 sm:p-2.5 flex flex-col gap-1.5 shadow-[0_1px_3px_rgba(22,21,19,0.05)] min-w-0 cursor-pointer hover:shadow-[0_2px_8px_rgba(22,21,19,0.10)] transition-shadow"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={`View details for ${displayName}`}
    >
      <div className="flex items-center justify-end">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[0.55rem] font-extrabold uppercase tracking-[0.05em] rounded-full px-1.5 py-0.5 whitespace-nowrap",
            colId === "payment" && payChip
              ? ""
              : orderChip
                ? ""
                : "bg-bg-surface text-text-secondary",
          )}
          style={
            colId === "payment" && payChip
              ? { background: payChip.bg, color: payChip.text }
              : orderChip
                ? { background: orderChip.bg, color: orderChip.text }
                : undefined
          }
        >
          {colId === "payment" && payChip
            ? payChip.label
            : orderChip
              ? orderChip.label
              : card.workflow_status || "Open"}
        </span>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Avatar
          src={card.creator?.profile_pic}
          username={handle}
          name={displayName}
          size={26}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[0.78rem] sm:text-[0.82rem] font-extrabold text-text-primary leading-tight truncate">
            {displayName}
          </div>
          {handle && handle !== displayName && (
            <div className="text-[0.6rem] sm:text-[0.65rem] text-text-tertiary truncate leading-tight">
              @{handle}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.6rem] font-bold bg-[--bg-ecru] border border-[--border] text-text-secondary tabular whitespace-nowrap">
          {card.post_id}
        </span>
        {collabId && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.6rem] font-bold bg-[--bg-ecru] border border-[--border] text-text-secondary tabular whitespace-nowrap"
            title="Collab ID"
          >
            {collabId}
          </span>
        )}
      </div>

      {(card.creator?.category || card.creator?.followers) && (
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {card.creator.category && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.6rem] font-bold bg-[--bg-surface] text-[--text-secondary] uppercase tracking-wide whitespace-nowrap">
              {card.creator.category}
            </span>
          )}
          {card.creator.followers != null && (
            <span className="text-[0.6rem] text-text-tertiary font-semibold tabular">
              {formatFollowers(card.creator.followers)}
            </span>
          )}
        </div>
      )}

      {card.campaign_id && (
        <div className="text-[0.65rem] font-bold text-text-secondary bg-[--bg-ecru] border border-[--border] px-2 py-0.5 rounded-full self-start max-w-full truncate">
          {card.campaign_id}
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-y-0.5 gap-x-2 text-[0.58rem] sm:text-[0.62rem] min-w-0">
        <dt className="text-text-tertiary font-bold uppercase tracking-[0.05em] whitespace-nowrap">
          {dateField.label}
        </dt>
        <dd className="text-right tabular text-text-secondary truncate">
          {formatDate(dateField.value)}
        </dd>
        {card.order_id && (
          <>
            <dt className="text-text-tertiary font-bold uppercase tracking-[0.05em] whitespace-nowrap">
              Order
            </dt>
            <dd className="text-right tabular text-text-secondary truncate font-mono text-[0.6rem]">
              {card.order_id}
            </dd>
          </>
        )}
      </dl>

      {card.onboarded_by ? (
        <footer className="pt-1.5 border-t border-border text-[0.62rem] font-semibold text-text-secondary truncate">
          {card.onboarded_by}
        </footer>
      ) : null}
    </article>
  );
}
