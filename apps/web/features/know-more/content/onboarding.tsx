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
            <strong>Submission toggle</strong> · two-state segment at the top
            of the filter bar. <KMCode>Not Submitted</KMCode> (the default on
            load) shows the work queue — rows whose onboarding form is not yet
            filled (workflow_status <KMCode>Reach Out</KMCode>).{" "}
            <KMCode>Submitted</KMCode> shows already-onboarded rows
            (<KMCode>On Board</KMCode> onward). The Stage dropdown narrows
            within the chosen side.
          </li>
          <li>
            <strong>List + cards</strong> · default to canonical onboarding
            table. Filter by campaign / stage / tier / email-missing.
          </li>
          <li>
            <strong>One row per collab</strong> · the board collapses
            multi-deliverable collabs to a single row — the primary deliverable
            stands in for the whole collab (mirrors how Accounts Hub and Order
            Status detect parents: <KMCode>deliverable_index is null OR = 1</KMCode>).
            A <KMCode>Layers</KMCode> chip shows the human count
            (<KMCode>1 deliverable</KMCode>, <KMCode>3 deliverables</KMCode> …)
            with the <KMCode>NR + NP + NS</KMCode> breakdown as its tooltip /
            sub-label. <strong>Single-deliverable collabs still read
            &ldquo;1 deliverable&rdquo;</strong> — the count is never hidden.
            This replaces the old Parent / Child N / Single lineage badges.
          </li>
          <li>
            <strong>See every deliverable</strong> · on a multi-deliverable
            collab, the card&apos;s <KMCode>View N</KMCode> affordance and the
            row&apos;s <KMCode>Overview</KMCode> both open the overview modal,
            which lists each deliverable (primary + linked children) with its
            own post_id. Children are never removed from the database — they are
            only folded into the parent for a cleaner board. They are still
            submitted individually in the <strong>Posting</strong> stage, and
            payment stays <strong>one-per-collab</strong> on the primary row.
          </li>
          <li>
            <strong>Submit form (order-form.tsx)</strong> · opens per row.
            Pencil-to-Send icon swaps once email is queued.
          </li>
          <li>
            <strong>Unified Save &amp; Review Email</strong> · the form&apos;s
            single primary button saves the onboarding, then opens the collab
            email preview inline in the same modal — edit, then{" "}
            <KMCode>Send Email</KMCode> or <KMCode>Save &amp; Skip Email</KMCode>.
            If SMTP fails the pane stays open to retry (the attempt is logged to{" "}
            <KMCode>email_logs</KMCode>); the saved onboarding is never lost. A
            standalone send still lives on each onboarded row.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="KPIs">
        <p>
          A KPI strip sits above the board. Every count is per-collab (parent
          row only).
        </p>
        <KMList>
          <li>
            <strong>Total Onboarded</strong> — collabs that have reached On
            Board onward.
          </li>
          <li>
            <strong>Pending</strong> — Reach Out collabs whose onboarding form
            is not yet filled.
          </li>
          <li>
            <strong>Completion Rate</strong> — Total Onboarded ÷ all collabs in
            scope.
          </li>
          <li>
            <strong>Shopify Validation %</strong> — share of onboarded collabs
            whose order_id validated against Shopify.
          </li>
          <li>
            <strong>Ad Rights / No Ad Rights</strong> — split by{" "}
            <KMCode>ads_usage_rights</KMCode>. Any non-empty value (e.g.{" "}
            <KMCode>12 Months</KMCode>) counts as ad-rights; blank counts as no
            ad-rights.
          </li>
          <li>
            <strong>Avg Deliverables</strong> — mean deliverable count per
            collab (reels + static posts + stories).
          </li>
          <li>
            <strong>Pending Email</strong> — onboarded collabs whose collab
            email is neither sent (<KMCode>collab_email_sent_at</KMCode> null)
            nor skipped (<KMCode>collab_email_skipped</KMCode> false).
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
            Required for <strong>Barter + Paid</strong>.
          </li>
          <li>
            <strong>Content Duration</strong> — fixed dropdown:{" "}
            <KMCode>24-25 sec</KMCode>, <KMCode>35-45 sec</KMCode>,{" "}
            <KMCode>45+ sec</KMCode> (per-collab). Legacy free-text values are
            tolerated on read.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Auto-populate from Reach Out">
        <KMCallout tone="info">
          If the Reach Out row already carries{" "}
          <KMCode>collab_type</KMCode> + <KMCode>commercial_amount</KMCode>{" "}
          (typical for Inbound batches where the creator quoted upfront), the
          Collab Type select + Commercials input mount in read-only mode with
          a <strong>FROM REACH OUT</strong> badge. Outbound rows that left
          commercials blank stay fully editable.
        </KMCallout>
      </KMSection>

      <KMSection tag="Equal-split commercial rule">
        <KMCallout tone="warning">
          <strong>Single agreed total ÷ deliverable count.</strong> The
          operator enters one total commercial figure. On submit, the parent
          + every child row each get{" "}
          <KMCode>commercial_amount = total / (reels + static_posts)</KMCode>
          . Example: ₹10,000 across 3 deliverables = ₹3,333.33 per row, summing
          back to ₹9,999.99 ≈ ₹10,000. Cost Analytics, Accounts Hub, Order
          Status, My Dashboard and the Dashboard stage board all sum siblings
          per <KMCode>(inf_id, collab_number)</KMCode> to display the
          originally-agreed total.
        </KMCallout>
      </KMSection>

      <KMSection tag="Fields written">
        <KMList>
          <li>
            <strong>posts (parent)</strong> · workflow_status{" "}
            <KMCode>On Board</KMCode>, onboard_date, agency_name, collab_type,
            commercial_amount (per-row split), est_delivery, reels,
            static_posts, stories, ads_usage_rights, email, tracking_id,
            garment_qty, deliverable_index <KMCode>1</KMCode>, deliverable_type,
            bank_name, bank_number, ifsc.
          </li>
          <li>
            <strong>posts (children)</strong> · auto-inserted when reels +
            posts &gt; 1. Each child gets its own post_id{" "}
            <KMCode>SIF-&#123;N&#125;-P&#123;N&#125;-C&#123;collab&#125;</KMCode>
            , deliverable_index 2…N, inherits collab_number,{" "}
            <KMCode>commercial_amount</KMCode> = the same split share. Payment
            still lives on the parent. On the Onboarding board these child rows
            are folded into the parent (see &ldquo;One row per collab&rdquo;
            above) — they remain full rows in the database and surface
            individually in the Posting stage.
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
            <strong>Barter</strong> — UI locks Commercials to 0. Bank section
            stays optional. Server-side enforcement: schema overrides{" "}
            <KMCode>commercial_amount</KMCode> to 0 regardless of input.
          </li>
          <li>
            <strong>Barter + Paid</strong> — Commercials required and &gt; 0.
            Bank Name + Account Number + IFSC required. Equal-split applies
            on insert.
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
            Re-submitting overwrites the commercial split on the parent +
            children. Use Posting form to edit posted collabs instead.
          </li>
          <li>
            Red <KMCode>MissingFieldsAlert</KMCode> renders above the submit
            button listing every empty required column when the form is
            invalid. Uses Zod{" "}
            <KMCode>safeParse(watch())</KMCode> so all blockers surface at
            once, not one-at-a-time.
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
