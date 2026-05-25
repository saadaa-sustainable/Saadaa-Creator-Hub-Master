import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function CampaignsKM() {
  return (
    <>
      <KMHeader
        title="Campaigns"
        subtitle="Server-generated IFC IDs. Two budget lines (Barter + Paid) seed automatically. Tabs for Create + Existing in one switcher."
      />

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>Create Campaign</strong> tab — form for campaign details
            and budget rows.
          </li>
          <li>
            <strong>Existing Campaigns</strong> tab — list of all campaigns
            with quick links back into the form for editing.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Fields written (campaigns table)">
        <KMList>
          <li>
            <strong>campaign_id</strong> · auto <KMCode>IFC###</KMCode> — server
            assigns the next free integer. You never type this.
          </li>
          <li>
            <strong>campaign_name</strong> · operator-facing label shown in
            every dropdown across reach-out, onboarding, accounts hub.
          </li>
          <li>
            <strong>key_message</strong> · single line summarising the angle.
            Surfaces inside the collab brief email.
          </li>
          <li>
            <strong>start_date · end_date</strong> · planning window. Drives
            dashboard active-campaign badge and burn-rate charts.
          </li>
          <li>
            <strong>creator_target · brief_link · internal_brief</strong> ·
            target headcount + external/internal brief URLs.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Budget rows (campaign_budget)">
        <p>
          On Add the form auto-appends two rows: one{" "}
          <KMCode>collab_type=Barter</KMCode> and one{" "}
          <KMCode>collab_type=Paid</KMCode>. Adjust or delete to make the
          campaign fully one type.
        </p>
        <KMList>
          <li>
            <strong>Barter</strong> rows lock <KMCode>avg_compensation</KMCode>{" "}
            + commercials to 0 (read-only field) — Saadaa never pays cash on
            barter.
          </li>
          <li>
            <strong>Paid</strong> rows accept any positive avg compensation;
            roll up into <KMCode>campaign_budget_monthly</KMCode> view for
            trend charts (auto-regenerated, don&apos;t edit directly).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Campaign ID is immutable once created. Rename / archive freely;
            historical posts keep their link.
          </li>
          <li>
            Deleting a campaign is blocked while any posts reference it (FK
            constraint). Archive instead.
          </li>
          <li>
            Editing an existing campaign re-uses the same form via the
            switcher tab — the create button text flips to &quot;Update&quot;.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Create requires the <KMCode>campaign_create</KMCode> permission.
        Without it, only the Existing tab is visible.
      </KMCallout>
    </>
  );
}
