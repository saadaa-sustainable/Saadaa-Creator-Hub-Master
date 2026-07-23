import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function AccountsHubKM() {
  return (
    <>
      <KMHeader
        title="Accounts Hub"
        subtitle="Per-collab payment ledger. Inline log form keyed on Collab ID, kanban (incl. a Payment Done lane) + list, CSV template download + upload, CSV exports with creator + profile URL, 15th/30th payable cycle with a monthly accounts digest."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. Log Payments panel</strong> — always-open inline form,
            multi-row. The first field is a <strong>Collab ID</strong> dropdown
            (one entry per payable collab); picking one shows the creator&apos;s
            name + handle to its right and auto-fills the agreed amount.
            Toolbar: Add row · <strong>Download CSV template</strong> ·{" "}
            <strong>Upload CSV</strong> (CSV/XLSX file) · Submit.
          </li>
          <li>
            <strong>2. Filter strip</strong> — search, campaign, payment status,
            ads rights.
          </li>
          <li>
            <strong>3. KPI strip</strong> — Posts Done · Not Due · Due · Partial
            / Outstanding · Done (5 cards with rupee totals). The Partial /
            Outstanding card shows how many collabs are part-paid and the total
            balance still owed.
          </li>
          <li>
            <strong>3b. Outstanding alert</strong> — a banner above the board
            listing every partially-paid collab + its remaining balance whenever
            full payment isn&apos;t done. Silent when nothing is outstanding.
          </li>
          <li>
            <strong>4. Toolbar</strong> — Downloads (Due CSV · Paid CSV ·{" "}
            <strong>Partial Payment</strong> · All) + the <strong>INF Orders</strong>{" "}
            button on the left, Kanban / List view toggle on the right. The{" "}
            <strong>Partial Payment</strong> export only appears when at least one
            collab has an outstanding balance.
          </li>
          <li>
            <strong>INF Orders</strong> — a modal listing every collab mapped to a
            Collab ID that has an order (<strong>Barter AND Barter + Paid</strong>)
            — the barter orders the payment board hides. Unmapped orders are
            excluded. One row per collab with INF ID, Post ID, Collab ID, creator,
            campaign, <strong>Collab Type</strong>, commercial finalized at
            onboarding, garments, order id/date, tracking. Filters: search +
            campaign + <strong>Collab Type</strong> (All / Barter / Barter + Paid);{" "}
            <strong>Export CSV</strong> downloads exactly the rows shown.
          </li>
          <li>
            <strong>5. Board</strong> — Kanban (4 columns:{" "}
            <strong>Onboarded · Posted · Payments · Partial Payments</strong>) or
            List table. Buckets in priority order: a collab with an outstanding
            balance → <strong>Partial Payments</strong>; a fully{" "}
            <KMCode>Done</KMCode> collab → <strong>Payments</strong> (card turns
            green, = the Paid CSV set); everything else by stage. Reach Out is
            absent (no order/payment yet). <strong>Sole-barter collabs are
            excluded</strong> from Onboarded/Posted — they carry no payment and
            live in the <strong>INF Orders</strong> view. Posted also holds
            collabs not payment-ready yet; they show no payment state until all
            posting forms are complete and the creator accepts the partnership.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="When a payment becomes pending">
        <KMCallout tone="info">
          Payment Pending is created per <strong>Collab ID</strong> only when
          every deliverable has both <KMCode>post_link</KMCode> and{" "}
          <KMCode>post_date</KMCode>, and the creator&apos;s partnership status
          is <KMCode>approved</KMCode>. Before both conditions are true there is
          no Not Due/Due draft, no payable amount, and no pending-payment KPI
          count.
        </KMCallout>
      </KMSection>

      <KMSection tag="Fields written (payments table)">
        <KMList>
          <li>
            <strong>
              collab_id · post_id · deliverable_post_id · inf_id · username
            </strong>{" "}
            · the payment is keyed on <KMCode>collab_id</KMCode> (
            <KMCode>SIF-1-C1</KMCode>) — one payment covers the whole collab.
            post_id stores the representative deliverable. Denormalised so the
            ledger row is self-contained.
          </li>
          <li>
            <strong>status</strong> · <KMCode>Not Due</KMCode> →{" "}
            <KMCode>Due</KMCode> (cron after due_date) →{" "}
            <KMCode>Partial</KMCode> (an installment paid, balance still owed) →{" "}
            <KMCode>Done</KMCode> (collab total fully paid).
          </li>
          <li>
            <strong>amount · utr · payment_date</strong> · what was paid and
            when. Each installment is its own row carrying a distinct UTR;{" "}
            <KMCode>(post_id, utr)</KMCode> is the dedup key (multiple
            installments per collab are allowed). The auto-init draft row has a
            null UTR and never counts toward paid-so-far.
          </li>
          <li>
            <strong>due_date · estimated_payable_date</strong> · due_date =
            post_date + 30; est_payable = next 15th or 30th of the month.
          </li>
          <li>
            <strong>collab_number · bank_name · bank_number · ifsc</strong> ·
            pulled from posts at submit time.
          </li>
          <li>
            <strong>posted_but_not_tested</strong> · stamped{" "}
            <KMCode>true</KMCode> when the paid post is an ad-eligible
            deliverable (ads_usage_rights set, or present in the Meta Ads
            warehouse) that was <strong>not yet tested</strong> as an ad — same
            tested/untested rule as the Ad Status view. Payment is{" "}
            <strong>never blocked</strong> by this; it only annotates the ledger
            with a <KMCode>Not Tested</KMCode> pill and auto-clears once the ad
            becomes tested (see Exports + cron).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="3 gates at submit (collab-level)">
        <KMList>
          <li>
            <strong>Stage</strong> — post must be in <KMCode>Posted</KMCode> or{" "}
            <KMCode>Delivered</KMCode>.
          </li>
          <li>
            <strong>Collab readiness</strong> — EVERY deliverable sharing the{" "}
            <KMCode>collab_id</KMCode> must have post_link AND post_date. One
            missing deliverable locks the whole collab.
          </li>
          <li>
            <strong>Partnership</strong> — the creator must have{" "}
            <strong>accepted</strong> the partnership before a draft or final
            payment can be written: the current{" "}
            <KMCode>partnership_status</KMCode> is <KMCode>approved</KMCode>, OR a{" "}
            <KMCode>partnership_approved_at</KMCode> timestamp was recorded (the
            auto-fetched acceptance) and the creator has not since gone{" "}
            <KMCode>pending</KMCode>/<KMCode>rejected</KMCode>/
            <KMCode>revoked</KMCode>. Applies to every collab regardless of Ads
            Usage Rights. A Partnership Key alone (stored at invite time) or an
            admin override does NOT bypass creator acceptance. Enforced in both
            the app and the payment DB functions.
          </li>
        </KMList>
        <p>
          Blocked rows surface in the toast with the exact reason per post (e.g.{" "}
          <KMCode>not posted yet: SIF-1-P2, SIF-1-P3</KMCode>
          or <KMCode>partnership not approved on: SIF-1-P2</KMCode>).
        </p>
        <KMCallout tone="info">
          The final save checks the whole Collab ID again and processes one
          payment at a time. Even when a child Post ID is pasted, payment is
          recorded against the collab&apos;s main post. Previous installments
          are kept as permanent history.
        </KMCallout>
      </KMSection>

      <KMSection tag="Submit validation alert">
        <KMCallout tone="info">
          Above the Submit button a red <KMCode>MissingFieldsAlert</KMCode>{" "}
          lists every empty required column across every row in the batch
          (Collab ID · Payment Date · Amount). The alert refreshes live as
          fields are filled; banner disappears once zero blockers remain.
        </KMCallout>
      </KMSection>

      <KMSection tag="Notification emails">
        <KMCallout tone="info">
          On a successful payment submit, a submitter confirmation and a
          payment-processed email both fire. Each send is recorded to{" "}
          <KMCode>email_logs</KMCode> for audit.
        </KMCallout>
      </KMSection>

      <KMSection tag="CSV template · upload">
        <KMList>
          <li>
            <strong>Download CSV template</strong> · a ready-to-fill{" "}
            <KMCode>Collab ID, UTR, Date, Amount</KMCode> CSV (seeded with one
            example row from your first payable collab).
          </li>
          <li>
            <strong>Upload CSV</strong> · pick a <KMCode>.csv</KMCode> or{" "}
            <KMCode>.xlsx</KMCode> file; it parses straight into the form rows.
          </li>
        </KMList>
        <p>
          The parser auto-detects a header row (<KMCode>Collab ID</KMCode> or
          legacy <KMCode>Post ID</KMCode> · UTR · Date · Amount); Excel serial
          dates + dd/mm/yyyy + yyyy-mm-dd all parse; the ID cell is resolved
          (Collab ID → representative post). A{" "}
          <strong>10-row batch limit</strong> applies (extras dropped with a
          toast). Every parsed row runs the same three gates above. The{" "}
          <strong>&quot;Same payment date for all entries&quot;</strong>{" "}
          checkbox copies the first row&apos;s date to every row.
        </p>
      </KMSection>

      <KMSection tag="Kanban vs List + click-through">
        <KMList>
          <li>
            <strong>Kanban</strong> — Posted column shows ONE card per{" "}
            <KMCode>collab_id</KMCode> (the representative) with a{" "}
            <KMCode>N delivs</KMCode> chip + split-amount line. Click any card →
            stage-wise overview modal listing every deliverable of the collab
            with IG verification button + partnership status.
          </li>
          <li>
            <strong>List</strong> — flat table for batch scanning; same filter
            strip applies.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Equal-split + payment cascade">
        <KMCallout tone="info">
          The agreed total is equal-split across every deliverable on Onboarding
          submit · <KMCode>per_row = total ÷ deliverable_count</KMCode>.
          Accounts Hub queries sum the deliverables of a{" "}
          <KMCode>collab_id</KMCode> so the representative row always renders
          the originally-agreed total in the KPI strip + overview modal.{" "}
          <strong>One payment per collab_id</strong>: the payment is keyed on{" "}
          <KMCode>collab_id</KMCode> and stored on the representative
          deliverable (lowest post_id). When it is marked Paid, every other
          deliverable of the collab has its{" "}
          <KMCode>posts.payment_status</KMCode> cascaded to{" "}
          <KMCode>Done</KMCode> and any stray payment rows on those deliverables
          are removed — no double-counting.
        </KMCallout>
      </KMSection>

      <KMSection tag="Partial payments (installments)">
        <p>
          A collab&apos;s agreed total can be paid in{" "}
          <strong>installments</strong>. Enter an amount{" "}
          <strong>less than the collab total</strong> in the Log Payments form —
          the inline badge confirms <KMCode>Partial · ₹X will stay due</KMCode>{" "}
          (an under-payment is NOT an error). On submit:
        </p>
        <KMList>
          <li>
            Each installment is recorded as a <strong>new payment row</strong>{" "}
            with its own UTR (never an overwrite). Paid-so-far ={" "}
            <KMCode>sum of all installment amounts</KMCode> for the collab.
          </li>
          <li>
            <KMCode>0 &lt; paid &lt; total</KMCode> → collab status{" "}
            <KMCode>Partial</KMCode>: a <KMCode>Partial</KMCode> pill + a{" "}
            <KMCode>₹remainder due</KMCode> pill show on the card, the board-top
            alert lists it, and the Partial / Outstanding KPI tallies the
            balance.
          </li>
          <li>
            <KMCode>paid ≥ total</KMCode> → collab flips to{" "}
            <KMCode>Done</KMCode> and cascades to every deliverable (same as a
            single full payment).
          </li>
          <li>
            A collab that is <strong>already fully paid</strong> blocks further
            installments (reported as a duplicate). Re-submitting the same UTR
            on a post is also blocked.
          </li>
        </KMList>
        <p>
          The Due CSV export includes Partial collabs (balance still owed) with{" "}
          <KMCode>Paid So Far</KMCode> + <KMCode>Outstanding</KMCode> columns.
        </p>
      </KMSection>

      <KMSection tag="Exports + cron">
        <KMList>
          <li>
            <strong>Due CSV</strong> · Due / Not Due / Partial rows for the next
            disbursement run.
          </li>
          <li>
            <strong>Paid CSV</strong> · history of <KMCode>Done</KMCode> rows
            (the Payment Done lane) for finance reconciliation.
          </li>
          <li>
            <strong>All CSV</strong> · full export including drafts.
          </li>
          <li>
            <strong>Every export</strong> now carries Collab ID + creator name +
            username + <KMCode>Profile URL</KMCode> (
            <KMCode>instagram.com/&lt;username&gt;</KMCode>) alongside the
            amount / paid-so-far / outstanding / UTR / cycle columns.
          </li>
          <li>
            <strong>Monthly payable digest</strong> — the daily cron also sends
            a single branded digest two days before each payout: on the{" "}
            <strong>13th</strong> for the 15th cycle and the{" "}
            <strong>28th</strong> for the 30th cycle, to the{" "}
            <strong>Accounts Team + Global Admins</strong>.
            It lists every still-owed collab in that cycle with creator, handle,
            Collab ID, amount, due date, status, and full{" "}
            <strong>bank name / account / IFSC</strong> for processing. Fires at
            most once per day; voided (offboarded) collabs are excluded. This
            priority digest runs before long notification backlogs. Partial
            payments are collapsed to one collab row and show only the
            outstanding balance.
          </li>
          <li>
            <strong>recomputePaymentStates</strong> runs inside the 3-hr cron
            and flips Not Due → Due when due_date has passed + heals NULL
            est_payable values. The server action also{" "}
            <strong>auto-clears</strong> <KMCode>posted_but_not_tested</KMCode>{" "}
            once an ad has been tested (the edge cron mirror picks this up after
            its next deploy). Idempotent.
          </li>
          <li>
            <strong>Backfill suppression</strong> — page-load no longer creates
            ghost UTR-less drafts for collabs that aren&apos;t payment-eligible
            yet.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="danger">
        Payments cannot be reversed. Always open the IG link in the overview
        modal and verify the post is live before logging UTR.
      </KMCallout>
    </>
  );
}
