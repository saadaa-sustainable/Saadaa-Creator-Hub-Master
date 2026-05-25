import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function OnboardingKM() {
  return (
    <>
      <KMHeader
        title="Creator Onboarding"
        subtitle="Promote a Reach Out into an On Board collab — confirm commercials, capture address + bank, fire the collab email."
      />

      <KMSection tag="Purpose">
        <p>
          Onboarding is the gate between &quot;maybe&quot; and &quot;agreed.&quot;
          Submitting locks the commercial sheet, writes shipping + bank
          metadata, sends the brand template email, and flips the workflow
          to <KMCode>On Board</KMCode>. The card stays in the kanban until
          the order ships from Shopify.
        </p>
      </KMSection>

      <KMSection tag="Fields written">
        <KMList>
          <li>
            <strong>posts</strong> · workflow_status <KMCode>On Board</KMCode>,
            onboard_date, collab_type (<KMCode>Barter</KMCode> or{" "}
            <KMCode>Barter + Paid</KMCode>), reels / static_posts / stories,
            ads_usage_rights, commercial_amount, barter_amount, est_delivery,
            partnership_id (if Ads = Yes).
          </li>
          <li>
            <strong>creators</strong> · email, address, city, state, pincode,
            country, bank_name, bank_number, ifsc. Address inherits the
            Shopify customer record if order_id is already linked.
          </li>
          <li>
            <strong>email_logs</strong> · the brand-template send is logged
            here with status, subject, recipient, and the rendered HTML body
            so we can replay it.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Collab Type rule">
        <KMList>
          <li>
            <strong>Barter</strong> — UI locks Avg / Commercial to 0. Order is
            free + content is the only exchange.
          </li>
          <li>
            <strong>Barter + Paid</strong> — both fields editable. Avg auto-fills
            as <KMCode>commercial ÷ deliverables</KMCode> when you change
            either side.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Multi-deliverable handling">
        <p>
          If the collab has 2+ deliverables (e.g. 1 Reel + 2 Static Posts),
          the form generates child post rows <KMCode>SIF-{"{N}"}-P{"{N}"}</KMCode>
          (P2, P3, …) sharing a common <KMCode>collab_number</KMCode>. The
          parent (P1) carries the commercial total; children inherit a split
          amount at payment time.
        </p>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Email must be present before Send. Missing email = red action chip
            on the card.
          </li>
          <li>
            Onboard date defaults to today (IST) but is editable.
          </li>
          <li>
            Partnership ID is required at submit only when ads_usage_rights is
            yes. Otherwise it can be added later from the Posting overview.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Re-onboarding the same collab is destructive — it overwrites the
        commercial sheet. Use the Posting form to edit posted collabs instead.
      </KMCallout>
    </>
  );
}
