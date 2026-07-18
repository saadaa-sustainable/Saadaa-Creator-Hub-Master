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
            <strong>Submission toggle</strong> · two-state segment at the top of
            the filter bar. <KMCode>Not Submitted</KMCode> (the default on load)
            shows the work queue — rows whose onboarding form is not yet filled
            (workflow_status <KMCode>Reach Out</KMCode>).{" "}
            <KMCode>Submitted</KMCode> shows already-onboarded rows (
            <KMCode>On Board</KMCode> onward). The Stage dropdown narrows within
            the chosen side.
          </li>
          <li>
            <strong>List + cards</strong> · default to canonical onboarding
            table. Filter bar: <strong>search</strong> (id / name / username /
            IG URL, debounced) · campaign · tier · region ·{" "}
            <strong>Reached out by</strong> (the team member who logged the
            reach-out, from the stable <KMCode>logged_by</KMCode> column) ·{" "}
            <strong>Content Type</strong> · reach-out from/to dates. Selecting a{" "}
            <strong>Reached out by</strong> member also scopes the KPI strip
            below the filters to that member&apos;s metrics.
          </li>
          <li>
            <strong>
              IDs are minted HERE — both post_id (P) and collab (C)
            </strong>{" "}
            · a reach-out row arrives with NULL <KMCode>post_id</KMCode> /{" "}
            <KMCode>collab_id</KMCode> (identified by its bigserial id). On
            submit, <KMCode>mint_onboarding_block</KMCode> reserves, in one
            advisory-locked call: the <strong>collab</strong> (reuse the C
            already on that exact Order ID, else the creator&apos;s next{" "}
            <KMCode>SIF-1-C{"{n}"}</KMCode>) and the <strong>P-block</strong> —
            one <KMCode>post_id</KMCode> per deliverable (
            <KMCode>P{"{maxP+1}"}</KMCode> … <KMCode>P{"{maxP+N}"}</KMCode>),
            all sharing the collab_id.{" "}
            <strong>
              maxP and maxC continue over <KMCode>posts</KMCode> ∪{" "}
              <KMCode>historic_posts</KMCode>
            </strong>{" "}
            — a historic creator with C2/P2 onboarded with 3 deliverables yields
            C3 + P3/P4/P5. <strong>Reach-out rows have no collab yet</strong> —
            the board shows <KMCode>Pending</KMCode> until onboarded. The board
            groups by <KMCode>collab_id</KMCode> and renders ONE representative
            row per collab (lowest <KMCode>post_id</KMCode>). A dedicated{" "}
            <strong>Collab ID</strong> column / chip shows it on the row, card,
            and overview.
          </li>
          <li>
            <strong>Prior-collab history badge</strong> · on a{" "}
            <KMCode>Reach Out</KMCode> row a small ↻ chip appears under the{" "}
            <KMCode>Pending</KMCode> collab label showing the creator&apos;s
            collaboration history. A repeat collaborator reads{" "}
            <KMCode>
              {"{N}"} prior · C1, C2 · next C{"{n}"}
            </KMCode>{" "}
            (prior collab count, their existing C numbers, and the C the next
            onboard will mint); a creator we only reached out to before reads{" "}
            <KMCode>Reached out before · next C2</KMCode>; a brand-new creator
            shows nothing. Sourced server-side from the{" "}
            <KMCode>prior_collab_summary</KMCode> RPC (counts{" "}
            <KMCode>posts</KMCode> ∪ <KMCode>historic_posts</KMCode>), so the C
            it predicts matches exactly what{" "}
            <KMCode>mint_onboarding_block</KMCode> reserves on submit. The same
            chip renders on the row and the card.
          </li>
          <li>
            <strong>Deliverables chip</strong> · a <KMCode>Layers</KMCode> chip
            shows the human count (<KMCode>1 deliverable</KMCode>,{" "}
            <KMCode>3 deliverables</KMCode> …) with the{" "}
            <KMCode>NR + NP + NS</KMCode> breakdown as its tooltip / sub-label.
            <strong>
              {" "}
              Single-deliverable collabs still read &ldquo;1 deliverable&rdquo;
            </strong>{" "}
            — the count is never hidden. This replaces the old Parent / Child N
            / Single lineage badges, which are gone entirely.
          </li>
          <li>
            <strong>See every deliverable</strong> · on a multi-deliverable
            collab, the card&apos;s <KMCode>View N</KMCode> affordance and the
            row&apos;s <KMCode>Overview</KMCode> both open the overview modal,
            which lists each deliverable with its own short{" "}
            <KMCode>post_id</KMCode> (<KMCode>SIF-1-P1</KMCode>,{" "}
            <KMCode>SIF-1-P2</KMCode> …) under the shared collab_id. The other
            deliverables are never removed from the database — they are only
            folded into the representative for a cleaner board. They are still
            submitted individually in the <strong>Posting</strong> stage, and
            payment is raised <strong>once per collab_id</strong> on the
            representative row.
          </li>
          <li>
            <strong>Submit form (order-form.tsx)</strong> · opens per row.
            Pencil-to-Send icon swaps once email is queued.
          </li>
          <li>
            <strong>Unified Save &amp; Review Email</strong> · the form&apos;s
            single primary button saves the onboarding, then opens the collab
            email preview inline in the same modal — edit, then{" "}
            <KMCode>Send Email</KMCode> or{" "}
            <KMCode>Save &amp; Skip Email</KMCode>. If SMTP fails the pane stays
            open to retry (the attempt is logged to <KMCode>email_logs</KMCode>
            ); the saved onboarding is never lost. A standalone send still lives
            on each onboarded row.
          </li>
          <li>
            <strong>Campaign brief must be a Drive FILE</strong> · the email
            attaches the brief only when the campaign&apos;s brief link points
            to a single Drive file (PDF/Doc/Slides). A{" "}
            <strong>Drive folder link</strong> (or a Spreadsheet / non-file URL)
            can&apos;t be attached, so the send is <strong>blocked</strong> with
            a clear note — open the folder, then paste the single brief FILE
            link in the campaign (Edit campaign) and retry.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="KPIs">
        <p>
          A KPI strip sits above the board. Every count is per-collab —
          deliverables are grouped by <KMCode>collab_id</KMCode>.
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
            Type, Commercials ₹, Est. Delivery, Ads Usage Rights, Reels / Static
            Posts / Stories.
          </li>
          <li>
            <strong>Order Linkage</strong> — Order ID (Shopify), Order Status,
            Tracking ID, Garments Sent + Garment Qty. Address auto-fills from
            the Shopify customer if order_id matches. On submit, the Order ID is
            validated against synced Shopify data; if it isn&apos;t there yet
            (freshly placed), the system does a live Shopify check and pulls it
            in — but only if the order is tagged for influencer orders{" "}
            <KMCode>INF</KMCode>. Untagged or unknown order ⇒ blocked + the
            submitter is alerted. Once onboarded, the card, list row and
            Overview all carry a <strong>View Order</strong> link that opens
            the order in Shopify admin (new tab).
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
          If the Reach Out row already carries <KMCode>collab_type</KMCode> +{" "}
          <KMCode>commercial_amount</KMCode> (typical for Inbound batches where
          the creator quoted upfront), the Collab Type select + Commercials
          input mount in read-only mode with a <strong>FROM REACH OUT</strong>{" "}
          badge. Outbound rows that left commercials blank stay fully editable.
        </KMCallout>
      </KMSection>

      <KMSection tag="Onboarding cap (per campaign)">
        <KMList>
          <li>
            A campaign can ONBOARD at most its allocated creator count — the sum
            of <KMCode>num_influencers</KMCode> across its budget tiers.
            Reach-out is unlimited; <strong>this is where the cap bites</strong>
            . Once the cap is reached, onboarding a new creator is blocked with
            an <KMCode>X/cap</KMCode> message.
          </li>
          <li>
            The count is of creators{" "}
            <strong>currently onboarded and active</strong> (On Board / Order
            Sent / Posted / Delivered). If an onboarded creator is later{" "}
            <strong>offboarded</strong> (voided), they leave the count and a{" "}
            <strong>slot frees</strong> — a creator who reached out but
            wasn&apos;t onboarded can then be onboarded in their place.
          </li>
          <li>
            <KMCode>cap = 0</KMCode> (no budget rows) ⇒ no cap. Raise the
            allocation in <strong>Edit Campaign</strong> (Campaign Owner /
            Global Admin) to onboard more. Un-onboarded reach-outs are voided (→
            Cancelled) when the campaign closes; their data is kept.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Equal-split commercial rule">
        <KMCallout tone="warning">
          <strong>Single agreed total ÷ deliverable count.</strong> The operator
          enters one total commercial figure. On submit, every deliverable row
          of the collab gets{" "}
          <KMCode>commercial_amount = total / (reels + static_posts)</KMCode>.
          Example: ₹10,000 across 3 deliverables = ₹3,333.33 per row, summing
          back to ₹9,999.99 ≈ ₹10,000. Cost Analytics, Accounts Hub, Order
          Status, My Dashboard and the Dashboard stage board all sum the
          deliverables of a <KMCode>collab_id</KMCode> to display the
          originally-agreed total.
        </KMCallout>
      </KMSection>

      <KMSection tag="Fields written">
        <KMList>
          <li>
            <strong>posts (representative)</strong> · workflow_status{" "}
            <KMCode>On Board</KMCode>, onboard_date, agency_name, collab_type,
            commercial_amount (per-row split), est_delivery, reels,
            static_posts, stories, ads_usage_rights, email, tracking_id,
            garment_qty, <KMCode>collab_id</KMCode> (shared across the collab),
            deliverable_type, bank_name, bank_number, ifsc.
          </li>
          <li>
            <strong>posts (additional deliverables)</strong> · auto-inserted
            when reels + posts &gt; 1. Each gets its own SHORT post_id{" "}
            <KMCode>SIF-&#123;N&#125;-P&#123;M&#125;</KMCode> (no{" "}
            <KMCode>-C</KMCode> suffix), the SAME <KMCode>collab_id</KMCode> as
            the rest of the collab, and <KMCode>commercial_amount</KMCode> = the
            same split share. Payment is raised once per collab_id on the
            representative. On the Onboarding board these rows fold into the
            representative (see &ldquo;Collab ID model&rdquo; above) — they
            remain full rows in the database and surface individually in the
            Posting stage.
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
            posts.collab_email_sent_at + collab_email_skipped flags so the UI
            can render a clean state per row.
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
            Bank Name + Account Number + IFSC required. Equal-split applies on
            insert.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            A creator-level blacklist is terminal. Onboarding checks the creator
            by SIF and username before campaign-cap or Shopify work and rejects
            an offboarded creator with the recorded reason.
          </li>
          <li>
            payment_status is left <KMCode>null</KMCode> at onboarding — only
            Posting flips it via auto-init draft, and only when the whole collab
            is payment-eligible.
          </li>
          <li>
            Email must be present before Send. Missing email = red action chip
            on the card.
          </li>
          <li>
            Re-submitting overwrites the commercial split on the parent +
            children. Use Posting form to edit posted collabs instead.
          </li>
          <li>
            Red <KMCode>MissingFieldsAlert</KMCode> renders above the submit
            button listing every empty required column when the form is invalid.
            Uses Zod <KMCode>safeParse(watch())</KMCode> so all blockers surface
            at once, not one-at-a-time.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Multi-deliverable expansion is destructive on re-submit. If you change
        reels / posts counts after the initial onboarding, child rows are
        re-created from scratch and any per-child posting data on prior children
        is lost.
      </KMCallout>
          <KMSection tag="Today board">
        <p>Under the header, the <strong>Today · Onboarded</strong> board counts each member's collabs onboarded today — a multi-deliverable collab counts once. Resets at midnight IST.</p>
      </KMSection>
    </>
  );
}
