import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function CostAnalyticsKM() {
  return (
    <>
      <KMHeader
        title="Cost Analytics"
        subtitle="Actual (first created budget) vs Expected (committed spend) by month × campaign × tier — with the V0/V1/V2 version split per campaign."
      />

      <KMSection tag="Actual vs Expected (2026-07-15 definitions)">
        <KMList>
          <li>
            <strong>Actual</strong> = the campaign&apos;s <strong>first
            created budget</strong> (its V0 version) — the sanctioned money.
          </li>
          <li>
            <strong>Expected</strong> = what onboarded collabs commit us to
            spend: <KMCode>Barter + Paid → commercial + order value</KMCode>,{" "}
            <KMCode>Barter → order value only</KMCode>. Order value is the
            Shopify order total for the collab&apos;s Order ID; a collab lands
            in its onboarding month.
          </li>
          <li>
            <strong>Budget Left</strong> = Actual − Expected (the old
            &quot;Variance&quot; jargon is gone — red means over budget by
            that amount).
          </li>
          <li>
            <strong>Version split</strong> — every campaign row in Campaign
            Totals expands (▸) into its V0 / carry-forward / top-up chain with
            the Expected charged against each version&apos;s month. Hover a
            V-chip for what it means; carry-forwards show the admin&apos;s
            &quot;why unused&quot; note when written.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Equal-split sourcing rule">
        <KMCallout tone="info">
          After 2026-05-27 every deliverable carries{" "}
          <KMCode>commercial_amount = agreed_total ÷ deliverable_count</KMCode>
          . Cost Analytics sums commercial_amount across <strong>every</strong>{" "}
          row of a collab (parent + children) so{" "}
          <KMCode>actualCost</KMCode> equals the originally-agreed total.
          <KMCode>actualCreators</KMCode> still counts <em>parent rows only</em>
          {" "}so one collab = one creator. Skipping this step would either
          triple-count children or under-count the spend.
        </KMCallout>
      </KMSection>

      <KMSection tag="KPI formulas">
        <KMList>
          <li>
            <strong>Budget Creators</strong> ·{" "}
            <KMCode>Σ campaign_budget.num_influencers</KMCode> for the active
            filter window (month / tier / campaign / collab type).
          </li>
          <li>
            <strong>Budget Cost ₹</strong> ·{" "}
            <KMCode>Σ campaign_budget.total_cost</KMCode> (compensation only —
            garments tracked separately in Cost Composition).
          </li>
          <li>
            <strong>Actual Cost ₹</strong> ·{" "}
            <KMCode>Σ posts.commercial_amount</KMCode> across all rows where{" "}
            <KMCode>workflow_status</KMCode> ∈ ACTUAL_STATUSES (On Board,
            Posted, Delivered) and the month derived from{" "}
            <KMCode>onboard_date</KMCode> (fallback{" "}
            <KMCode>reach_out_date</KMCode>) falls in the window.
          </li>
          <li>
            <strong>Remaining ₹</strong> ·{" "}
            <KMCode>Budget Cost − Actual Cost</KMCode>. Negative = over-spend.
          </li>
          <li>
            <strong>Variance</strong> ·{" "}
            <KMCode>Actual Cost − Budget Cost</KMCode>. Same sign as Remaining
            but rendered with absolute value + direction chip.
          </li>
          <li>
            <strong>% Utilised</strong> ·{" "}
            <KMCode>round(actualCost / budgetCost × 100)</KMCode>. Drives the
            row-level variance flag and alerts panel.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Variance flag rules">
        <KMList>
          <li>
            <strong>Green</strong> · % utilised between 80%–110%.
          </li>
          <li>
            <strong>Yellow</strong> · % utilised between 50%–80% or 110%–130%.
          </li>
          <li>
            <strong>Red</strong> · % utilised below 50% (underspend) or above 130%
            (overspend).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Tier classification">
        <p>
          Tiers are derived from <KMCode>creators.followers</KMCode>: Nano (&lt;10K),
          Micro (10K–50K), Mid-tier (50K–500K), Macro (500K–1M), Mega (&gt;1M).
          Posts without a matching creator row fall into &quot;Unknown&quot; tier.
        </p>
      </KMSection>

      <KMSection tag="Roll-ups">
        <KMList>
          <li>
            <strong>Month summary</strong> · groups rows by{" "}
            <KMCode>month</KMCode> only; budget + actual values aggregate
            across campaigns and tiers. Used for the trend chart.
          </li>
          <li>
            <strong>Tier mix</strong> ·{" "}
            <KMCode>actualCost</KMCode> grouped by tier → percentage shown in
            the Tier Mix bar.
          </li>
          <li>
            <strong>Workspace KPIs</strong> · final fallback: when{" "}
            <KMCode>campaigns.total_budget</KMCode> is missing, the budget KPI
            uses Σ tier totals as a back-up.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>campaign_budget</strong> · target spend per month ×
            campaign × tier (
            <KMCode>num_influencers, total_cost, min_garments, max_garments, total_with_garments</KMCode>
            ).
          </li>
          <li>
            <strong>posts</strong> · commercial_amount (post-split),
            campaign_id, onboard_date, collab_type, workflow_status, inf_id,
            collab_number.
          </li>
          <li>
            <strong>creators</strong> · followers (for tier classification).
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Budgets must be entered in the <KMCode>campaign_budget</KMCode> table
        before this view shows meaningful variance data. Contact your team lead
        to seed budget rows for active campaigns.
      </KMCallout>
    </>
  );
}
