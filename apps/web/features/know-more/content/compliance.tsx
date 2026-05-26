import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function ComplianceKM() {
  return (
    <>
      <KMHeader
        title="Compliance KPIs"
        subtitle="Process health snapshot. 8 KPI cards across conversion rates, coverage completeness, and average turnaround times."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — ClipboardCheck icon + title + Know More button.
          </li>
          <li>
            <strong>2. Filter strip</strong> — campaign, date range. URL-driven.
          </li>
          <li>
            <strong>3. KPI grid</strong> — 8 cards: 2-col mobile, 4-col desktop.
          </li>
          <li>
            <strong>4. Campaign breakdown table</strong> — same 8 KPIs per campaign.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="The 8 KPI formulas">
        <KMList>
          <li>
            <strong>Onboard Conv Rate</strong> ·{" "}
            <KMCode>(On Board + Posted + Delivered) / Total RO × 100</KMCode>
          </li>
          <li>
            <strong>Posting Rate</strong> ·{" "}
            <KMCode>(Posted + Delivered) / Active × 100</KMCode> where Active excludes
            RTO and Cancelled.
          </li>
          <li>
            <strong>Delivery Rate</strong> ·{" "}
            <KMCode>Delivered / (Posted + Delivered) × 100</KMCode>
          </li>
          <li>
            <strong>RTO Rate</strong> ·{" "}
            <KMCode>RTO / Orders Placed × 100</KMCode>
          </li>
          <li>
            <strong>Email Coverage</strong> ·{" "}
            <KMCode>Rows with email / Total RO × 100</KMCode>
          </li>
          <li>
            <strong>Bank Coverage</strong> ·{" "}
            <KMCode>Rows with bank account / Active × 100</KMCode>
          </li>
          <li>
            <strong>Payment Rate</strong> ·{" "}
            <KMCode>Paid collabs / (Posted + Delivered) × 100</KMCode> (Barter
            collabs always count as paid since there is no cash owed).
          </li>
          <li>
            <strong>Avg TAT (RO → Post)</strong> · median days from{" "}
            <KMCode>reach_out_date</KMCode> to <KMCode>post_date</KMCode>{" "}
            across Posted + Delivered rows.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="How aggregates are computed">
        <p>
          All 8 KPIs are computed server-side via a Postgres function using{" "}
          <KMCode>GROUP BY</KMCode> aggregates. No client-side row iteration — the
          query is efficient even with 50k+ posts in scope.
        </p>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> · workflow_status, email,{" "}
            <KMCode>bank_name / bank_number / ifsc</KMCode> (for bank
            coverage), payment_status, reach_out_date, post_date, campaign_id,
            deliverable_index, collab_number.
          </li>
          <li>
            <strong>shopify_orders</strong> · for RTO rate (order placed count).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Edge cases">
        <KMList>
          <li>
            Conversion Rate below 30%: investigate ghosting rate in Reach Out stage.
          </li>
          <li>
            Email Coverage below 80%: missing emails block collab confirmation sends.
          </li>
          <li>
            Bank Coverage below 70%: will cause payment failures in the Accounts Hub
            cycle.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Coverage metrics below 80% will cause operational issues in downstream stages
        (email sending, payment processing). Investigate at the Onboarding stage.
      </KMCallout>
    </>
  );
}
