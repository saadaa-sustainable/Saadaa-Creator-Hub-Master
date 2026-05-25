import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function CampaignsKM() {
  return (
    <>
      <KMHeader
        title="Campaigns"
        subtitle="Server-generated IFC IDs. Two budget lines (Barter + Paid) seed automatically. Re-used across every downstream stage."
      />

      <KMSection tag="Purpose">
        <p>
          A campaign is the unit every collab attaches to. The ID lives on
          posts, payments, ad-status rows, and dashboards. Once created you can
          generate reach-outs against it, route inbound creators to it, and
          watch budget burn in real time.
        </p>
      </KMSection>

      <KMSection tag="Fields written (campaigns + campaign_budget)">
        <KMList>
          <li>
            <strong>campaign_id</strong> · auto <KMCode>IFC###</KMCode> — server
            assigns the next free integer. You never type this.
          </li>
          <li>
            <strong>campaign_name</strong> · operator-facing label shown in
            every dropdown and chip across the app.
          </li>
          <li>
            <strong>key_message</strong> · single line summarising the
            creative angle. Surfaces inside the collab email template.
          </li>
          <li>
            <strong>start_date · end_date</strong> · optional planning window.
            Drives dashboard "active campaigns" badge and budget burn rate.
          </li>
          <li>
            <strong>creator_target · brief_link</strong> · target headcount
            and brief URL. Brief link appears as a button on the campaign
            card.
          </li>
          <li>
            <strong>campaign_budget</strong> rows · always seeded with one
            <KMCode>Barter</KMCode> and one <KMCode>Paid</KMCode> line. Edit
            or delete to make a campaign purely one type.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Where the campaign flows">
        <KMList>
          <li>
            <strong>Reach Out</strong> — campaign selector required before
            submit. Outbound + inbound both write <KMCode>posts.campaign_id</KMCode>.
          </li>
          <li>
            <strong>Onboarding</strong> — campaign chip on every row + filter
            by campaign.
          </li>
          <li>
            <strong>Accounts Hub</strong> — budget burn = sum of payment
            amounts grouped by campaign vs. the budget rows.
          </li>
          <li>
            <strong>Ad Status</strong> — only ads tied to a campaign get
            ROAS / impressions overlays from the Meta Ads warehouse.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Campaign ID is immutable once created. You can rename / archive
            the campaign but the IFC number stays so historical posts keep
            their link.
          </li>
          <li>
            Deleting a campaign row is blocked while any posts reference it
            (FK constraint). Archive instead.
          </li>
          <li>
            Budget lines roll up across <KMCode>campaign_budget_monthly</KMCode>
            for trend charts; don&apos;t edit those — they regenerate from the
            base rows.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Campaign create needs the <KMCode>campaign_create</KMCode> permission.
        Operators without it see Existing Campaigns only.
      </KMCallout>
    </>
  );
}
