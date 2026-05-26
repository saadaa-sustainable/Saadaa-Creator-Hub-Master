import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function TatKM() {
  return (
    <>
      <KMHeader
        title="TAT Analytics"
        subtitle="7 turnaround-time metrics across all workflow transitions, plus per-campaign benchmark chart."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li><strong>KPI strip</strong> — Total Posts · Avg RO→Post · Delivered count · RTO rate.</li>
          <li><strong>Base: Reach Out</strong> — 3 cards: RO→Onboard · RO→Order Created · RO→Posted.</li>
          <li><strong>Base: Onboarding</strong> — 2 cards: Onboard→Delivered · Onboard→Posted.</li>
          <li><strong>Base: Order & Delivery</strong> — 2 cards: Order→Delivered · Delivered→Posted.</li>
          <li><strong>Campaign TAT Benchmark</strong> — horizontal bar chart, avg days RO→Posted per campaign. Green ≤30d · Amber ≤60d · Red &gt;60d.</li>
        </KMList>
      </KMSection>

      <KMSection tag="The 7 TAT metrics">
        <KMList>
          <li><strong>Reach Out → Onboarded</strong> · <KMCode>reach_out_date → onboard_date</KMCode></li>
          <li><strong>Reach Out → Order Created</strong> · <KMCode>reach_out_date → shopify_orders.order_placed_date</KMCode></li>
          <li><strong>Reach Out → Posted</strong> · <KMCode>reach_out_date → post_date</KMCode> (end-to-end)</li>
          <li><strong>Onboarding → Delivered</strong> · <KMCode>onboard_date → est_delivery</KMCode></li>
          <li><strong>Onboarding → Posted</strong> · <KMCode>onboard_date → post_date</KMCode></li>
          <li><strong>Order Created → Delivered</strong> · <KMCode>order_placed_date → est_delivery</KMCode></li>
          <li><strong>Delivered → Posted</strong> · <KMCode>est_delivery → post_date</KMCode></li>
        </KMList>
      </KMSection>

      <KMSection tag="Each card shows">
        <p>
          Avg days (large number) · Best (min) · Worst (max) · n (sample count).
          Health bar: green ≤14d · amber ≤30d · red &gt;30d.
          Cards with zero samples render as dashed outlines — no data yet.
        </p>
      </KMSection>

      <KMSection tag="Edge cases & why a card shows no data">
        <KMList>
          <li>Rows missing either date are excluded — null dates never skew averages.</li>
          <li><strong>Negative TAT is dropped.</strong> If <KMCode>post_date</KMCode> is earlier than <KMCode>reach_out_date</KMCode> (e.g. test data entered out of order, or the creator posted before formal reach-out was logged), every metric that ends at <KMCode>post_date</KMCode> will show "No data recorded yet" for those rows. Fix the underlying dates in Reach Out or Posting Data.</li>
          <li>Dates before 2020-01-01 are treated as invalid and excluded.</li>
          <li>Only posts with <KMCode>workflow_status</KMCode> in Posted or Delivered are included.</li>
          <li><strong>Order deduplication</strong> — Delivered / RTO / Cancelled KPI counts are per unique <KMCode>order_id</KMCode>, not per post row. One order with 3 child deliverables counts as 1.</li>
        </KMList>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li><strong>posts</strong> · reach_out_date, onboard_date, post_date, est_delivery, order_id, order_status, campaign_id.</li>
          <li><strong>shopify_orders</strong> · order_id, order_placed_date, tracking_status.</li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Use the Campaign filter to benchmark specific campaigns. Wide gaps between Best and Worst within one metric signal outliers worth investigating in Onboarding or Order Status.
      </KMCallout>
    </>
  );
}
