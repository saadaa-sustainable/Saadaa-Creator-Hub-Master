import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function FunnelKM() {
  return (
    <>
      <KMHeader
        title="Funnel View"
        subtitle="Reach Out → Onboard → Posted conversion rates broken down by period. Identify where the pipeline leaks."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — Filter icon + title + Know More button.
          </li>
          <li>
            <strong>2. Period picker</strong> — This Week · Last Week · MTD · Custom
            date range.
          </li>
          <li>
            <strong>3. Funnel bar chart</strong> — 3 bars (Reached · Onboarded ·
            Posted) with % drop annotations between each stage.
          </li>
          <li>
            <strong>4. Period breakdown table</strong> — one row per period showing
            raw counts + conversion rates.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Funnel stages">
        <KMList>
          <li>
            <strong>Reached</strong> · all posts with a reach_out_date in the period,
            regardless of current status.
          </li>
          <li>
            <strong>Onboarded</strong> · posts from the Reached cohort that reached
            On Board or beyond (onboard_date not null).
          </li>
          <li>
            <strong>Posted</strong> · posts from the Onboarded cohort that reached
            Posted or Delivered.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Conversion formulas">
        <KMList>
          <li>
            <strong>Onboard %</strong> · <KMCode>Onboarded / Reached × 100</KMCode>
          </li>
          <li>
            <strong>Post %</strong> · <KMCode>Posted / Onboarded × 100</KMCode>
          </li>
          <li>
            <strong>Overall %</strong> · <KMCode>Posted / Reached × 100</KMCode>
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Week definition">
        <p>
          &quot;This Week&quot; runs Monday–Sunday (ISO week, Monday start). This is
          consistent with the Internal Dashboard and other period-based views. The
          legacy view used a non-standard week start — this version is corrected.
        </p>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> · reach_out_date, onboard_date,{" "}
            <KMCode>post_date</KMCode>, workflow_status, campaign_id,
            deliverable_index (parent-only counts so multi-deliverable collabs
            don&apos;t inflate the cohort).
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        A low Onboard % (below 40%) signals ghosting or slow follow-up in the Reach
        Out stage. A low Post % (below 60%) signals delays between onboarding and
        content delivery — investigate the Posting stage.
      </KMCallout>
    </>
  );
}
