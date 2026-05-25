import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function OnboardingKM() {
  return (
    <>
      <KMHeader
        title="Creator Onboarding"
        subtitle="Promote a Reach Out into On Board. Three sections: Onboarding Configuration · Order Linkage · Bank — plus the collab email send."
      />

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>List + cards</strong> · default to canonical onboarding
            table. Filter by campaign / stage / tier / email-missing.
          </li>
          <li>
            <strong>Submit form (order-form.tsx)</strong> · opens per row.
            Pencil-to-Send icon swaps once email is queued.
          </li>
          <li>
            <strong>Collab email modal</strong> · preview the rendered HTML
            template before send; skip with reason if you can&apos;t email
            this collab.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Form sections">
        <KMList>
          <li>
            <strong>Onboarding Configuration</strong> — Agency Name, Collab
            Type, Commercials ₹, Est. Delivery, Ads Usage Rights, Reels /
            Static Posts / Stories.
          </li>
          <li>
            <strong>Order Linkage</strong> — Order ID (Shopify), Order Status,
            Tracking ID, Garments Sent + Garment Qty. Address auto-fills from
            the Shopify customer if order_id matches.
          </li>
          <li>
            <strong>Bank Details</strong> — Bank Name, Bank Number, IFSC.
            Optional but populated for Paid collabs.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Fields written">
        <KMList>
          <li>
            <strong>posts (parent)</strong> · workflow_status{" "}
            <KMCode>On Board</KMCode>, onboard_date, agency_name, collab_type,
            commercial_amount, barter_amount, est_delivery, reels,
            static_posts, stories, ads_usage_rights, email, tracking_id,
            garment_qty, garments_sent, bank_name, bank_number, ifsc,
            parent_post_id, deliverable_role <KMCode>parent</KMCode> /{" "}
            <KMCode>single</KMCode>, deliverable_index{" "}
            <KMCode>1</KMCode>, deliverable_type.
          </li>
          <li>
            <strong>posts (children)</strong> · auto-inserted when reels +
            posts &gt; 1. Each child gets its own post_id{" "}
            <KMCode>SIF-{"{N}"}-P{"{N}"}</KMCode>, deliverable_index 2…N,
            deliverable_role <KMCode>child</KMCode>, inherits collab_number.
          </li>
          <li>
            <strong>creators</strong> · email, address fields (state, city,
            pincode, country, street_address), bank fields.
          </li>
          <li>
            <strong>email_logs</strong> · brand template HTML, recipient,
            status, subject, send timestamp.
          </li>
          <li>
            posts.collab_email_sent_at + collab_email_skipped flags so the
            UI can render a clean state per row.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Collab Type rule">
        <KMList>
          <li>
            <strong>Barter</strong> — UI locks Avg / Commercial to 0. Form
            sets barter_amount, commercial_amount stays 0.
          </li>
          <li>
            <strong>Barter + Paid</strong> — both fields editable. Avg
            auto-fills as <KMCode>commercial ÷ deliverables</KMCode> when
            either side changes.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            payment_status is left <KMCode>null</KMCode> at onboarding — only
            Posting flips it via auto-init draft, and only when the whole
            collab is payment-eligible.
          </li>
          <li>
            Email must be present before Send. Missing email = red action
            chip on the card.
          </li>
          <li>
            Re-submitting overwrites the commercial sheet on the parent. Use
            Posting form to edit posted collabs instead.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Multi-deliverable expansion is destructive on re-submit. If you change
        reels / posts counts after the initial onboarding, child rows are
        re-created from scratch and any per-child posting data on prior
        children is lost.
      </KMCallout>
    </>
  );
}
