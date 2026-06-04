import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function AccountsHubKM() {
  return (
    <>
      <KMHeader
        title="Accounts Hub"
        subtitle="Per-collab payment ledger. Inline log form, kanban + list, Excel paste import, CSV exports, 15th/30th payable cycle."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. Log Payments panel</strong> — always-open inline form
            with multi-row entry + Paste from Excel + Submit button.
          </li>
          <li>
            <strong>2. Filter strip</strong> — search, campaign, payment
            status, ads rights.
          </li>
          <li>
            <strong>3. KPI strip</strong> — Posts Done · Not Due · Due · Done
            (4 cards with rupee totals).
          </li>
          <li>
            <strong>4. Toolbar</strong> — Downloads (Due CSV · Paid CSV ·
            All) on the left, Kanban / List view toggle on the right.
          </li>
          <li>
            <strong>5. Board</strong> — Kanban (3 columns: Reach Out · On
            Board · Posted) or List table.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Fields written (payments table)">
        <KMList>
          <li>
            <strong>post_id · deliverable_post_id · inf_id · username</strong>{" "}
            · denormalised so the ledger row is self-contained.
          </li>
          <li>
            <strong>status</strong> · <KMCode>Not Due</KMCode> →{" "}
            <KMCode>Due</KMCode> (cron after due_date) →{" "}
            <KMCode>Done</KMCode> (UTR added).
          </li>
          <li>
            <strong>amount · utr · payment_date</strong> · what was paid and
            when. UTR is the cross-post dedup key.
          </li>
          <li>
            <strong>due_date · estimated_payable_date</strong> · due_date =
            post_date + 30; est_payable = next 15th or 30th of the month.
          </li>
          <li>
            <strong>collab_number · deliverable_index · bank_name ·
            bank_number · ifsc</strong> · pulled from posts at submit time.
          </li>
          <li>
            <strong>posted_but_not_tested</strong> · stamped{" "}
            <KMCode>true</KMCode> when the paid post is an ad-eligible
            deliverable (ads_usage_rights set, or present in the Meta Ads
            warehouse) that was <strong>not yet tested</strong> as an ad —
            same tested/untested rule as the Ad Status view. Payment is{" "}
            <strong>never blocked</strong> by this; it only annotates the
            ledger with a <KMCode>Not Tested</KMCode> pill and auto-clears once
            the ad becomes tested (see Exports + cron).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="3 gates at submit (collab-level)">
        <KMList>
          <li>
            <strong>Stage</strong> — post must be in{" "}
            <KMCode>Posted</KMCode> or <KMCode>Delivered</KMCode>.
          </li>
          <li>
            <strong>Collab readiness</strong> — EVERY sibling deliverable
            must have post_link AND post_date. One missing sibling locks
            the whole collab.
          </li>
          <li>
            <strong>Partnership</strong> — when ads_usage_rights = Yes on
            any sibling, every sibling needs a partnership_id before any
            payment can settle.
          </li>
        </KMList>
        <p>
          Blocked rows surface in the toast with the exact reason per post
          (e.g. <KMCode>siblings not posted yet: SIF-1-P2, SIF-1-P3</KMCode>
          or <KMCode>partnership key missing on: SIF-1-P2</KMCode>).
        </p>
      </KMSection>

      <KMSection tag="Submit validation alert">
        <KMCallout tone="info">
          Above the Submit button a red <KMCode>MissingFieldsAlert</KMCode>{" "}
          lists every empty required column across every row in the batch
          (Post ID · Payment Date · Amount). The alert refreshes live as
          fields are filled; banner disappears once zero blockers remain.
        </KMCallout>
      </KMSection>

      <KMSection tag="Excel paste import">
        <p>
          <KMCode>Paste from Excel</KMCode> accepts tab- or comma-separated
          rows up to a <strong>200-row batch limit</strong>. Headers (Post ID,
          UTR, Date, Amount) are auto-detected. Excel serial dates +
          dd/mm/yyyy + yyyy-mm-dd all parse. Every parsed row runs the same
          three gates above.
        </p>
      </KMSection>

      <KMSection tag="Kanban vs List + click-through">
        <KMList>
          <li>
            <strong>Kanban</strong> — Posted column shows only parents with a{" "}
            <KMCode>Parent · N delivs</KMCode> chip + split-amount line. Click
            any card → stage-wise overview modal listing every sibling
            deliverable with IG verification button + partnership status.
          </li>
          <li>
            <strong>List</strong> — flat table for batch scanning; same
            filter strip applies.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Equal-split + payment cascade">
        <KMCallout tone="info">
          After 2026-05-27 the agreed total is equal-split across every
          deliverable on Onboarding submit ·{" "}
          <KMCode>per_row = total ÷ deliverable_count</KMCode>. Accounts Hub
          queries sum siblings per <KMCode>(inf_id, collab_number)</KMCode> so
          the parent row always renders the originally-agreed total in the KPI
          strip + Posting Overview modal. <strong>One payment per collab</strong>
          : when the parent row is marked Paid, every child row&apos;s{" "}
          <KMCode>posts.payment_status</KMCode> cascades to <KMCode>Done</KMCode>{" "}
          and no separate child payment rows are inserted.
        </KMCallout>
      </KMSection>

      <KMSection tag="Exports + cron">
        <KMList>
          <li>
            <strong>Due CSV</strong> · everything with status =
            <KMCode>Due</KMCode> for the next disbursement run.
          </li>
          <li>
            <strong>Paid CSV</strong> · history of <KMCode>Done</KMCode>{" "}
            rows for finance reconciliation.
          </li>
          <li>
            <strong>All CSV</strong> · full export including drafts.
          </li>
          <li>
            <strong>recomputePaymentStates</strong> runs inside the 3-hr cron
            and flips Not Due → Due when due_date has passed + heals NULL
            est_payable values. The server action also <strong>auto-clears</strong>{" "}
            <KMCode>posted_but_not_tested</KMCode> once an ad has been tested
            (the edge cron mirror picks this up after its next deploy).
            Idempotent.
          </li>
          <li>
            <strong>Backfill suppression</strong> — page-load no longer
            creates ghost UTR-less drafts for collabs that aren&apos;t
            payment-eligible yet.
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
