import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function OrderStatusKM() {
  return (
    <>
      <KMHeader
        title="Order Status"
        subtitle="Per-post fulfillment ledger. Shopify tracking + manual order status, two KPI strips (Volume + Commerce), bucket filters, list / cards."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. Order Volume strip</strong> — 6 clickable tiles: Total ·
            Pending Dispatch · In Transit · Delivered · RTO · Cancelled. Click
            any tile to filter the board to that bucket.
          </li>
          <li>
            <strong>2. Commerce Intel strip</strong> — 6 read-only tiles:
            Total Revenue · AOV · Refunds · Repeat Creators · Discount Codes ·
            Tagged Orders. Computed over the same scope as Volume.
          </li>
          <li>
            <strong>3. Filter strip</strong> — search · campaign · status ·
            collab · financial · discount · repeat creator. URL-driven so
            links are shareable.
          </li>
          <li>
            <strong>4. List / Cards toggle</strong> — both surfaces share the
            same filtered scope.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> · every row with non-null{" "}
            <KMCode>order_id</KMCode>. Carries the manual{" "}
            <KMCode>order_status</KMCode> + workflow stage + commercial.
          </li>
          <li>
            <strong>shopify_orders</strong> · live Shopify mirror (3-hr
            pg_cron job <KMCode>sync-shopify-orders</KMCode>). Provides
            tracking_status, delivery_date, totals, refunds, discount codes,
            tags, fulfillment events chain, customer order count.
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
          manual value is present, the pill shows a{" "}
          <KMCode>·M</KMCode> suffix so the operator knows Shopify hasn&apos;t
          synced yet. Pill tone reflects the bucket: warning (pending), info
          (transit), success (delivered), danger (RTO), muted (cancelled).
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
          <KMCode>Overdue</KMCode> pill next to the order ID and an outline
          glow on the card.
        </p>
      </KMSection>

      <KMSection tag="Commerce intel math">
        <KMList>
          <li>
            <strong>Total Revenue</strong> · sum of total_price excluding
            cancelled buckets.
          </li>
          <li>
            <strong>AOV</strong> · revenue ÷ non-cancelled order count.
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
            Shopify sync runs on a 3-hr cron. If a status looks stale, give
            it up to 3 hours; otherwise check the{" "}
            <KMCode>sync-shopify-orders-3h</KMCode> cron job state.
          </li>
          <li>
            Search matches creator name, handle, order ID, tracking ID, and
            campaign. Case-insensitive.
          </li>
          <li>
            KPI counts accumulate over the FULL scope of the campaign / collab
            filters; the search + financial + discount + repeat filters only
            trim the table, not the KPIs.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Click the creator name in card view to jump to the Influencer Journey
        page for that handle. Click any volume KPI tile to deep-link the
        board to that bucket.
      </KMCallout>
    </>
  );
}
