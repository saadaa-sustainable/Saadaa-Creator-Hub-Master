import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function HistoricAnalyticsKM() {
  return (
    <>
      <KMHeader
        title="Historic Analytics"
        subtitle="The full command-centre bento, run over the legacy archive instead of live posts. Same filters, KPIs, donuts, trend and stage board — sourced from the migrated historic data."
      />

      <KMSection tag="What this is">
        <p>
          Historic Analytics reuses the entire Dashboard{" "}
          <strong>Overview</strong> bento, but points every posts-driven query at
          the migrated archive (<KMCode>historic_posts</KMCode>, read through the{" "}
          <KMCode>historic_posts_dash</KMCode> view) instead of the live{" "}
          <KMCode>posts</KMCode> table. Creators and campaigns are still read from
          the live tables, so tiers, names and campaign labels resolve normally.
        </p>
        <KMList>
          <li>
            <strong>Same controls</strong> — campaign · date range · content type
            · tier · status, identical to the live Overview filter bar.
          </li>
          <li>
            <strong>Same body</strong> — headline KPI strip, content + tier
            donuts, monthly funnel trend, spends-per-campaign, top creators, team
            leaderboard and the 4-stage mini board.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Source table">
        <KMCallout tone="info">
          Reads <KMCode>historic_posts</KMCode> via the{" "}
          <KMCode>historic_posts_dash</KMCode> view. The view mirrors the columns
          the dashboard expects, NULL-aliasing the fields the legacy sheet never
          stored (reels / static_posts / stories / partnership_id /
          ad_partnership_valid / ads_usage_rights / collab_email_sent_at /
          collab_email_skipped / ads_status). Nothing here is editable — the
          archive is read-only.
        </KMCallout>
      </KMSection>

      <KMSection tag="0-value caveats">
        <KMList>
          <li>
            <strong>Deliverable counts read 0</strong> — the legacy sheet never
            stored a structured reels / static / stories split, so the view
            NULL-aliases them. Avg-deliverable KPIs and the deliverable donut are
            therefore 0 / empty for historic rows by design, not a bug.
          </li>
          <li>
            <strong>Ad Winners = 0</strong> — there is no{" "}
            <KMCode>ads_status</KMCode> classification on legacy rows (it is
            NULL-aliased), so the Ad Winners headline stays 0.
          </li>
          <li>
            <strong>No partnership / collab-email signals</strong> — those
            columns are NULL-aliased too, so the related action chips never light
            up for historic data.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Only three stages">
        <KMCallout tone="warning">
          The migrated archive only ever reaches{" "}
          <strong>Reach Out → On Board → Posted</strong>. There is no Order
          Sent / Delivered / RTO / payment lifecycle in the legacy data, so the
          later bands of the stage board and any post-Posted metric are{" "}
          <strong>empty by design</strong>. Read the trend and stage board as a
          three-stage funnel.
        </KMCallout>
      </KMSection>

      <KMSection tag="Access">
        <KMList>
          <li>
            Gated by <KMCode>performance_view</KMCode> — the same scope that
            unlocks Cost Analytics, Compliance, Funnel and Internal Dashboard.
            Users without it are redirected to the main Dashboard.
          </li>
          <li>
            Lives in the sidebar <strong>System</strong> section next to Sheet
            View. The live Overview stays on the main Dashboard; this tab is the
            archive-only counterpart.
          </li>
        </KMList>
      </KMSection>
    </>
  );
}
