import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function AdStatusKM() {
  return (
    <>
      <KMHeader
        title="Ad Status"
        subtitle="Posts with ad usage rights. Classification status (Winner / ITE / Discarded) pulled from the Meta Ads warehouse once classified by the analytics team."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — Megaphone icon + title + Know More button.
          </li>
          <li>
            <strong>2. Filter strip</strong> — campaign, ads_usage_rights (yes/no),
            classification status. URL-driven.
          </li>
          <li>
            <strong>3. KPI strip</strong> — Total Eligible · Classified · In Meta Ads ·
            Pending Classification · Avg ROAS (placeholder until warehouse connects).
          </li>
          <li>
            <strong>4. Board toolbar</strong> — row count, List / Cards toggle.
          </li>
          <li>
            <strong>5. Ad table</strong> — one row per eligible post; avatar, campaign,
            usage rights, classification badge, partnership ID.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Eligibility criteria">
        <p>
          A post is eligible for ad status tracking when{" "}
          <KMCode>ads_usage_rights</KMCode> is non-empty AND{" "}
          <KMCode>workflow_status</KMCode> is &quot;Posted&quot; or
          &quot;Delivered&quot;. Draft or onboarding posts are excluded.
        </p>
      </KMSection>

      <KMSection tag="Classification badges">
        <KMList>
          <li>
            <strong>Winner</strong> · impressions ≥ 50K AND ROAS ≥ 3.0.
          </li>
          <li>
            <strong>ITE (In Testing)</strong> · impressions ≥ 50K AND ROAS &lt; 3.0.
          </li>
          <li>
            <strong>Discarded</strong> · impressions &lt; 50K.
          </li>
          <li>
            <strong>Pending</strong> · post is eligible but not yet classified by the
            warehouse sync.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Warehouse classification (current status)">
        <p>
          Classification data flows from the Meta Ads analytics warehouse maintained by
          the analytics team. The <KMCode>posts.ads_status</KMCode> column is populated
          by the warehouse sync job. Until that sync is connected to this environment,
          all eligible posts show as <strong>Pending Classification</strong>.
        </p>
      </KMSection>

      <KMSection tag="Partnership ID">
        <p>
          Each ad-eligible post has an inline editable <KMCode>partnership_id</KMCode>{" "}
          field. This is the Meta partnership ad ID used to run the creator&apos;s post
          as a paid ad. Save inline — no full form submission needed.
        </p>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> · ads_usage_rights, workflow_status, post_date,
            post_link. The <KMCode>ads_status</KMCode> column may not yet be present on
            prod — the page degrades gracefully if the column is missing.
          </li>
          <li>
            <strong>creators</strong> · inf_name, profile_pic, category, followers.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Ad classification (Winner / ITE / Discarded) requires the Meta Ads warehouse
        sync to be configured. Contact the analytics team to enable classification for
        this environment.
      </KMCallout>
    </>
  );
}
