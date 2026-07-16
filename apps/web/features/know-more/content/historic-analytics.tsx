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
          <strong>Overview</strong> bento, but points every posts-driven query
          at the migrated archive (<KMCode>historic_posts</KMCode>, read through
          the <KMCode>historic_posts_dash</KMCode> view) instead of the live{" "}
          <KMCode>posts</KMCode> table. Creators and campaigns are still read
          from the live tables, so tiers, names and campaign labels resolve
          normally.
        </p>
        <KMList>
          <li>
            <strong>Same controls</strong> — campaign · date range · content
            type · tier · status, identical to the live Overview filter bar.
          </li>
          <li>
            <strong>Same body</strong> — headline KPI strip, content + tier
            donuts, monthly funnel trend, spends-per-campaign, top creators,
            team leaderboard and the 4-stage mini board.
          </li>
          <li>
            <strong>Team rows</strong> — Funnel and Internal team selections
            open the same centered overview popup pattern used by Ad Status,
            with search, stage filters, row pagination and row-level Tracker
            details.
          </li>
          <li>
            <strong>Definitions everywhere</strong> — every KPI, chart, and
            table has the same plain-language info popover as the live
            Dashboard. Overview popups wrap long values instead of hiding them
            behind ellipses.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Source table">
        <KMCallout tone="info">
          Reads <KMCode>historic_posts</KMCode> via the{" "}
          <KMCode>historic_posts_dash</KMCode> view. The view mirrors the
          columns the dashboard expects, NULL-aliasing the fields the legacy
          sheet never stored (reels / static_posts / stories / partnership_id /
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
            NULL-aliases them. Avg-deliverable KPIs and the deliverable donut
            are therefore 0 / empty for historic rows by design, not a bug.
          </li>
          <li>
            <strong>Ad Winners = 0</strong> — there is no{" "}
            <KMCode>ads_status</KMCode> classification on legacy rows (it is
            NULL-aliased), so the Ad Winners headline stays 0.
          </li>
          <li>
            <strong>No partnership / collab-email signals</strong> — those
            columns are NULL-aliased too, so the related action chips never
            light up for historic data.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Only three stages">
        <KMCallout tone="warning">
          The migrated archive only ever reaches{" "}
          <strong>Reach Out → On Board → Posted</strong>. There is no Order Sent
          / Delivered / RTO / payment lifecycle in the legacy data, so the later
          bands of the stage board and any post-Posted metric are{" "}
          <strong>empty by design</strong>. Read the trend and stage board as a
          three-stage funnel.
        </KMCallout>
      </KMSection>

      <KMSection tag="Completing the full flow (onboard, then post)">
        <KMList>
          <li>
            Open a row that is still at <strong>Reach Out</strong> (no order) —
            a <strong>Complete onboarding</strong> box appears. It opens the{" "}
            <strong>same form as the live Onboarding stage</strong>: Shopify
            order lookup + validation, collab type + commercials (Barter locks
            to ₹0), deliverable counts, ads usage rights, order status, bank
            details — everything except the collaboration email to the creator,
            which is deliberately not sent for historic records.
          </li>
          <li>
            Saving mints the collab the same way the live flow does — it{" "}
            <strong>continues the creator&apos;s existing numbering</strong>{" "}
            (never reuses an existing C or P). Extra deliverables become new
            historic rows sharing the same Collab ID. Bank / agency / state
            also sync to the creator profile.
          </li>
          <li>
            The row flips to <KMCode>On Board</KMCode>. Reopen it and the{" "}
            <strong>Fill posting backlog</strong> box below completes the flow
            to Posted.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Filling the posting backlog">
        <KMList>
          <li>
            In the Funnel / Internal team-row drawer, open a row that is{" "}
            <strong>onboarded (order present) but has no real post link</strong>{" "}
            — a <strong>Fill posting backlog</strong> box appears.
          </li>
          <li>
            Paste the post URL: a <strong>live post-date preview</strong> shows
            under the input (decoded from the Instagram link itself; falls back
            to today when the link isn&apos;t decodable). Optional Download link
            and Raw dump fields match the live Posting form.
          </li>
          <li>
            On save the creator&apos;s <strong>partnership is checked live</strong>{" "}
            — an invite is sent only if they haven&apos;t accepted yet; the
            message reports the real outcome (already approved / invite sent /
            invite pending / rejected–revoked).
          </li>
          <li>
            The row flips to <KMCode>Posted</KMCode> and Funnel + Internal
            counts update immediately. For bulk edits use the{" "}
            <strong>Historic Posts</strong> tab in Sheet View.
          </li>
        </KMList>
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
