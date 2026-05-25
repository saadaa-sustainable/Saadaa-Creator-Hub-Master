import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function OrderStatusKM() {
  return (
    <>
      <KMHeader
        title="Order Status"
        subtitle="Per-collab fulfillment ledger. Shopify tracking + manual order status, two KPI strips (Volume + Commerce), bucket filters, list / cards + read-only Overview modal."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — Truck icon + title + Know More
            button.
          </li>
          <li>
            <strong>2. Filter strip</strong> — search, campaign, status,
            collab, financial, discount, repeat creator. URL-driven so links
            are shareable. A <KMCode>Clear</KMCode> ghost button appears once
            any filter is active.
          </li>
          <li>
            <strong>3. Order Volume strip</strong> — 6 clickable tiles: Total
            · Pending Dispatch · In Transit · Delivered · RTO · Cancelled.
            Click any tile to deep-link the board to that bucket.
          </li>
          <li>
            <strong>4. Commerce Intel strip</strong> — 6 read-only tiles:
            Total Revenue · Avg Order Value · Refunds · Repeat Creators ·
            Discount Codes · Tagged Orders.
          </li>
          <li>
            <strong>5. Board toolbar</strong> — row count chip on the left,
            List / Cards view toggle on the right.
          </li>
          <li>
            <strong>6. Board</strong> — list table or cards grid (mobile auto-
            switches to Cards regardless of toggle state).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> · every row with non-null{" "}
            <KMCode>order_id</KMCode> AND <KMCode>deliverable_index</KMCode> in
            (null, 1). Child deliverables are skipped — order tracking lives
            on the parent only.
          </li>
          <li>
            <strong>shopify_orders</strong> · live Shopify mirror (3-hr
            pg_cron <KMCode>sync-shopify-orders-3h</KMCode>). Provides
            tracking_status, delivery_date, totals, refunds, discount codes,
            tags, fulfillment events chain, customer order count, garments
            sent.
          </li>
          <li>
            <strong>creators</strong> · inf_name, profile_pic, category,
            followers for the table cells + card avatars.
          </li>
          <li>
            <strong>instagram_cache</strong> · fallback profile_pic when the
            creators row hasn&apos;t been enriched yet.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Status precedence">
        <p>
          Live Shopify <KMCode>tracking_status</KMCode> wins over the manual{" "}
          <KMCode>order_status</KMCode> when both are present. When only the
          manual value is present, the pill shows a <KMCode>·M</KMCode>{" "}
          suffix so the operator knows Shopify hasn&apos;t synced yet. Pill
          tone reflects the bucket: warning (pending), info (transit),
          success (delivered), danger (RTO), muted (cancelled).
        </p>
      </KMSection>

      <KMSection tag="Bucket mapping (effective status → KPI)">
        <KMList>
          <li>
            <strong>Pending Dispatch</strong> · unfulfilled · processing · on
            hold · scheduled · empty.
          </li>
          <li>
            <strong>In Transit</strong> · in transit · fulfilled · confirmed ·
            partially fulfilled · shipped.
          </li>
          <li>
            <strong>Delivered</strong> · delivered.
          </li>
          <li>
            <strong>RTO</strong> · rto · restocked.
          </li>
          <li>
            <strong>Cancelled</strong> · any status containing
            &quot;cancelled&quot;. <KMCode>order cancelled after rto</KMCode>{" "}
            counts toward both RTO and Cancelled buckets for accurate rate
            math.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Overdue flag">
        <p>
          A row is overdue when <KMCode>est_delivery &lt; today</KMCode> AND
          the effective status is NOT one of delivered / rto / order cancelled
          / order cancelled after rto. Surfaces as a red{" "}
          <KMCode>Overdue</KMCode> pill next to the order ID and on the card
          pills row; the card also gets a pending-state outline.
        </p>
      </KMSection>

      <KMSection tag="List view">
        <p>
          8 columns: Creator (avatar + name + handle), Campaign, Order ID
          (+ Overdue pill), Status, Tracking, Est Delivery, Total, Placed,
          and an <KMCode>Overview</KMCode> action button per row that opens
          the modal.
        </p>
      </KMSection>

      <KMSection tag="Card view">
        <p>
          Each card shows: avatar header (name + handle), pills row (status ·
          campaign · category · collab · overdue), 6-meta grid (Order ID ·
          Tracking · Est Delivery · Delivered · Total · Refund), fulfillment
          events line (truncated with a hover title), and a footer (Placed
          date + Overview button). Mobile (≤ 767px) forces this view even if
          the operator picked List.
        </p>
      </KMSection>

      <KMSection tag="Order Overview modal">
        <KMList>
          <li>
            <strong>Identity card</strong> — avatar, creator name, handle,
            shipping status pill.
          </li>
          <li>
            <strong>Tile grid</strong> — Campaign, Order ID, Tracking, Placed,
            Est Delivery, Delivered, Total, Refund.
          </li>
          <li>
            <strong>Compact tile row</strong> — Category, Collab, Garment Qty,
            Financial Status, Repeat Orders.
          </li>
          <li>
            <strong>Garments Sent</strong> — bold preview ending in{" "}
            <KMCode>…</KMCode> with a{" "}
            <KMCode>More…</KMCode> /
            <KMCode>Less…</KMCode> text toggle. Expand to see the full
            comma-separated SKU list as the same bold sentence (no
            duplication).
          </li>
          <li>
            <strong>Fulfillment Events</strong> — full chain (e.g.{" "}
            <KMCode>Confirmed → In transit → Out for delivery → Delivered</KMCode>)
            in an ecru highlight box.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Commerce intel math">
        <KMList>
          <li>
            <strong>Total Revenue</strong> · sum of total_price excluding
            cancelled buckets.
          </li>
          <li>
            <strong>Avg Order Value</strong> · revenue ÷ non-cancelled order
            count.
          </li>
          <li>
            <strong>Refunds</strong> · sum + count of rows where{" "}
            <KMCode>refund_amount &gt; 0</KMCode>; rate is over total scope.
          </li>
          <li>
            <strong>Repeat Creators</strong> · rows where{" "}
            <KMCode>customer_order_count &gt; 1</KMCode> on the Shopify side.
          </li>
          <li>
            <strong>Discount Codes</strong> · rows with any non-empty{" "}
            <KMCode>discount_codes</KMCode>.
          </li>
          <li>
            <strong>Tagged Orders</strong> · rows with any non-empty Shopify{" "}
            <KMCode>tags</KMCode> column.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Posts with no order_id are excluded entirely — they belong in
            Onboarding (Order Linkage section), not here.
          </li>
          <li>
            Shopify sync runs on a 3-hr cron. If a status looks stale, give it
            up to 3 hours; otherwise check the{" "}
            <KMCode>sync-shopify-orders-3h</KMCode> cron job state.
          </li>
          <li>
            Search matches creator name, handle, order ID, tracking ID, and
            campaign. Case-insensitive.
          </li>
          <li>
            KPI counts accumulate over the FULL scope of the campaign +
            collab filters (server-side). The search, financial, discount,
            and repeat-creator filters only trim the table — they don&apos;t
            move the KPIs.
          </li>
          <li>
            The active bucket tile (set by the Status filter) gets a dark
            outline so the operator always knows which slice is on screen.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Click any Volume KPI tile to deep-link the board to that bucket. Use
        the row Overview button (list or card) to inspect the full Shopify
        + posts payload for any order without leaving the page.
      </KMCallout>
    </>
  );
}
