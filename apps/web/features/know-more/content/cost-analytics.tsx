import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function CostAnalyticsKM() {
  return (
    <>
      <KMHeader
        title="Cost Analytics"
        subtitle="Budget vs Actual spend. Monthly + campaign × tier breakdown with variance flags."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — IndianRupee icon + title + Know More button.
          </li>
          <li>
            <strong>2. Filter strip</strong> — month, tier, collab type, campaign
            search. URL-driven.
          </li>
          <li>
            <strong>3. Summary KPI strip</strong> — Total Budget · Total Actuals ·
            Variance · % Utilised.
          </li>
          <li>
            <strong>4. Monthly summary table</strong> — budget creators vs actual
            creators, budget cost vs actual cost, variance, % utilised.
          </li>
          <li>
            <strong>5. Campaign × tier matrix</strong> — expandable per-campaign rows
            with tier sub-rows.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Budget source">
        <p>
          Budget data lives in the <KMCode>campaign_budgets</KMCode> Supabase table
          (campaign_id, tier, month, budget_amount, currency). This replaces the legacy
          external Tracker spreadsheet. Budgets are entered by the team lead at the
          start of each campaign month.
        </p>
      </KMSection>

      <KMSection tag="Actuals derivation">
        <KMList>
          <li>
            <strong>Actual creators</strong> · count of posts that reached On Board or
            beyond in the period, joined to campaign_id.
          </li>
          <li>
            <strong>Actual cost</strong> · sum of <KMCode>commercial_amount</KMCode>{" "}
            from posts in scope (Barter collabs contribute ₹0).
          </li>
          <li>
            <strong>Total cost with garments</strong> · actual cost + estimated garment
            cost (garment_qty × campaign garment value, if configured).
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

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>campaign_budgets</strong> · target spend per month × campaign × tier.
          </li>
          <li>
            <strong>posts</strong> · commercial_amount, campaign_id, onboard_date,
            collab_type.
          </li>
          <li>
            <strong>creators</strong> · followers (for tier classification).
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Budgets must be entered in the <KMCode>campaign_budgets</KMCode> table before
        this view shows meaningful variance data. Contact your team lead to seed budget
        rows for active campaigns.
      </KMCallout>
    </>
  );
}
