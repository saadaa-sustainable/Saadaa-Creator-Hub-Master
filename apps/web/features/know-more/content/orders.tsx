import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function OrdersKM() {
  return (
    <>
      <KMHeader
        title="Order Dashboard"
        subtitle="Shopify order ledger joined to creator collabs. Aggregated KPIs, live tracking status, and tier breakdown — distinct from Order Status (workflow view)."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — BarChart3 icon + title + Know More button.
          </li>
          <li>
            <strong>2. Filter strip</strong> — campaign, status bucket, date range. URL-driven, shareable.
          </li>
          <li>
            <strong>3. KPI strip</strong> — Total Orders · In-Transit · Delivered · RTO · Cancelled · Avg Days-to-Deliver.
          </li>
          <li>
            <strong>4. Board toolbar</strong> — row count chip, List / Cards view toggle.
          </li>
          <li>
            <strong>5. Ledger board</strong> — paginated order ledger; cards on mobile, table on md+.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>shopify_orders</strong> · live Shopify mirror synced every 3 hrs by{" "}
            <KMCode>sync-shopify-orders-3h</KMCode> cron. Source of truth for
            tracking_status, order totals, and delivery dates.
          </li>
          <li>
            <strong>posts</strong> · provides collab context (campaign, creator, collab
            type) joined on <KMCode>order_id</KMCode>.
          </li>
          <li>
            <strong>creators</strong> · inf_name, category, followers for row cells.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="KPI formulas">
        <KMList>
          <li>
            <strong>Total Orders</strong> · all rows with a non-null{" "}
            <KMCode>order_id</KMCode> in scope.
          </li>
          <li>
            <strong>In-Transit</strong> · tracking_status in (in transit, fulfilled,
            confirmed, partially fulfilled, shipped).
          </li>
          <li>
            <strong>Delivered</strong> · tracking_status = &quot;delivered&quot;.
          </li>
          <li>
            <strong>RTO</strong> · tracking_status in (rto, restocked).
          </li>
          <li>
            <strong>Cancelled</strong> · tracking_status contains &quot;cancelled&quot;.
          </li>
          <li>
            <strong>Avg Days-to-Deliver</strong> · mean of (delivery_date − order_date)
            across delivered rows in scope; null delivery_date rows excluded.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Shopify sync schedule">
        <p>
          The <KMCode>sync-shopify-orders-3h</KMCode> pg_cron job pulls all orders
          tagged <KMCode>IFAD</KMCode> from Shopify every 3 hours. If a status appears
          stale, allow up to 3 hours before investigating the cron job state in Supabase
          logs.
        </p>
      </KMSection>

      <KMSection tag="Differences from Order Status">
        <p>
          <strong>Order Status</strong> (Workflow section) is a per-collab fulfillment
          tracker — it shows the workflow stage of each post and lets operators take
          actions. <strong>Order Dashboard</strong> (System section) is a pure analytics
          ledger — aggregate KPIs, tier breakdown, and historical order data without
          workflow actions.
        </p>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Child deliverables (deliverable_index &gt; 1) are excluded — only parent
            posts carry order tracking.
          </li>
          <li>
            Posts without an <KMCode>order_id</KMCode> are excluded entirely.
          </li>
          <li>
            Cursor pagination — scroll or use page controls to load beyond the first
            50 rows. All KPI counts cover the full filtered scope, not just the visible
            page.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        KPI tiles accumulate over the full campaign + date filter scope. The search
        and status filters trim the visible rows without changing the KPI numbers.
      </KMCallout>
    </>
  );
}
