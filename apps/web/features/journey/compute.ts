import {
  JOURNEY_COLUMNS,
  type JourneyCard,
  type JourneyColumn,
  type JourneyColumnId,
  type JourneyFunnel,
  type JourneyKpi,
} from "./types";

/**
 * Bucket a flat card list into the four journey columns and derive the KPI +
 * funnel counts from the SAME set — the single source of truth for the journey
 * view. Called once on the server for first paint (unfiltered) and again on the
 * client after every client-side filter change, so the KPI strip, funnel strip
 * and board always agree (previously the KPIs were computed server-side over the
 * unfiltered set and never re-derived, so Team Member / Tier / etc. filters
 * silently left the KPI cards showing whole-pipeline totals).
 *
 * Pure: no I/O. The cards must already carry workflow_status, deliverable_index,
 * payment_status and (for board display) the joined creator.
 */
export function computeJourney(cards: JourneyCard[]): {
  columns: JourneyColumn[];
  kpi: JourneyKpi;
  funnel: JourneyFunnel;
} {
  const reachOutBucket: JourneyCard[] = [];
  const onBoardBucket: JourneyCard[] = [];
  const postedBucket: JourneyCard[] = [];
  const paymentBucket: JourneyCard[] = [];

  let activeCount = 0;
  let postedCount = 0;
  let closedCount = 0;

  // Funnel — cumulative parent-collab counts (each collab counted at every
  // stage it has reached, so rates stay monotonic).
  let reachedCount = 0;
  let onboardedCount = 0;
  let postedFunnelCount = 0;
  let paidCount = 0;

  for (const card of cards) {
    const statusKey = String(card.workflow_status ?? "").trim().toLowerCase();

    // KPI counts.
    if (statusKey.includes("reach out") || statusKey.includes("on board")) {
      activeCount++;
    } else if (
      statusKey.includes("posted") ||
      statusKey.includes("delivered")
    ) {
      postedCount++;
    } else if (
      statusKey === "rto" ||
      statusKey === "cancelled" ||
      statusKey.startsWith("rto")
    ) {
      closedCount++;
    }

    // Funnel — parent collabs only.
    const isParentRow =
      card.deliverable_index == null || Number(card.deliverable_index) === 1;
    if (isParentRow) {
      const reachedOnboard =
        statusKey.includes("on board") ||
        statusKey === "order sent" ||
        statusKey.includes("posted") ||
        statusKey.includes("delivered") ||
        statusKey.startsWith("rto") ||
        statusKey === "cancelled";
      const reachedPost =
        statusKey.includes("posted") || statusKey.includes("delivered");
      const reachedPaid =
        String(card.payment_status ?? "").trim().toLowerCase() === "done";

      reachedCount++;
      if (reachedOnboard) onboardedCount++;
      if (reachedPost) postedFunnelCount++;
      if (reachedPaid) paidCount++;
    }

    // Column buckets (mirror of the legacy queries.ts loop — reach-out and
    // on-board short-circuit; posted parents also seed the payment column).
    if (statusKey.includes("reach out") || statusKey === "") {
      reachOutBucket.push(card);
      continue;
    }
    if (statusKey.includes("on board") || statusKey === "order sent") {
      onBoardBucket.push(card);
      continue;
    }
    if (statusKey.includes("posted") || statusKey.includes("delivered")) {
      postedBucket.push(card);
      const isChild =
        card.deliverable_index != null && Number(card.deliverable_index) > 1;
      if (!isChild) paymentBucket.push(card);
    }
  }

  const bucketMap = new Map<JourneyColumnId, JourneyCard[]>([
    ["reach-out", reachOutBucket],
    ["on-board", onBoardBucket],
    ["posted", postedBucket],
    ["payment", paymentBucket],
  ]);

  const columns: JourneyColumn[] = JOURNEY_COLUMNS.map((col) => ({
    ...col,
    cards: bucketMap.get(col.id) ?? [],
  }));

  const kpi: JourneyKpi = {
    inPipeline: cards.length,
    active: activeCount,
    posted: postedCount,
    closed: closedCount,
  };

  const rate = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

  const funnel: JourneyFunnel = {
    reached: reachedCount,
    onboarded: onboardedCount,
    posted: postedFunnelCount,
    paid: paidCount,
    reachToOnboard: rate(onboardedCount, reachedCount),
    onboardToPost: rate(postedFunnelCount, onboardedCount),
    postToPayment: rate(paidCount, postedFunnelCount),
  };

  return { columns, kpi, funnel };
}
