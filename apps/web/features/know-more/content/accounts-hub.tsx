import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function AccountsHubKM() {
  return (
    <>
      <KMHeader
        title="Accounts Hub"
        subtitle="Per-collab payment ledger. Inline log form, kanban + list, CSV exports, 15th/30th payable cycle."
      />

      <KMSection tag="Purpose">
        <p>
          Single surface for tracking every payment from{" "}
          <KMCode>Not Due</KMCode> through <KMCode>Due</KMCode> to{" "}
          <KMCode>Done</KMCode>. Drafts are auto-created when a collab becomes
          payment-eligible; the operator&apos;s job is to verify the IG post
          is live, add UTR + payment date, and submit.
        </p>
      </KMSection>

      <KMSection tag="Fields written (payments)">
        <KMList>
          <li>
            <strong>post_id · deliverable_post_id</strong> · parent links the
            ledger row to the collab; the deliverable id captures which
            episode the UTR settles.
          </li>
          <li>
            <strong>status</strong> · <KMCode>Not Due</KMCode> →{" "}
            <KMCode>Due</KMCode> (cron after due_date) →{" "}
            <KMCode>Done</KMCode> (UTR added).
          </li>
          <li>
            <strong>amount · utr · payment_date</strong> · what was paid and
            when. UTR doubles as the cross-post dedup key.
          </li>
          <li>
            <strong>due_date · estimated_payable_date</strong> · due_date =
            post_date + 30; est_payable = next 15th or 30th of the month
            (Saadaa&apos;s settlement cycle).
          </li>
          <li>
            <strong>collab_number · deliverable_index</strong> · denormalised
            so the row makes sense without joining back to posts.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="3 gates at submit">
        <KMList>
          <li>
            <strong>Stage</strong> — post must be <KMCode>Posted</KMCode> or{" "}
            <KMCode>Delivered</KMCode>.
          </li>
          <li>
            <strong>Collab readiness</strong> — every sibling deliverable must
            have post_link AND post_date. One missing sibling locks the whole
            collab.
          </li>
          <li>
            <strong>Partnership</strong> — when ads_usage_rights = Yes on any
            sibling, every sibling needs a partnership_id before any payment
            can settle.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Kanban vs List">
        <KMList>
          <li>
            <strong>Kanban</strong> — 3 columns (Reach Out · On Board ·
            Posted). Posted column shows only parents with a{" "}
            <KMCode>Parent · N delivs</KMCode> chip + split amount line.
            Click any card → stage-wise overview modal.
          </li>
          <li>
            <strong>List</strong> — flat table for batch scanning; respects
            the same filter strip (campaign / status / ads rights).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Excel paste import">
        <p>
          The <KMCode>Paste from Excel</KMCode> button accepts tab- or
          comma-separated rows. Headers (<KMCode>Post ID</KMCode>,{" "}
          <KMCode>UTR</KMCode>, <KMCode>Date</KMCode>,{" "}
          <KMCode>Amount</KMCode>) are auto-detected. Excel serial dates +
          dd/mm/yyyy + yyyy-mm-dd all parse. Every parsed row runs the same
          three gates above — invalid rows surface in the toast with the
          exact reason per post.
        </p>
      </KMSection>

      <KMSection tag="Exports + cron">
        <KMList>
          <li>
            <strong>Due CSV</strong> · everything with status =
            <KMCode>Due</KMCode> for the next disbursement run.
          </li>
          <li>
            <strong>Paid CSV</strong> · history of <KMCode>Done</KMCode> rows
            with UTR + payment_date for finance reconciliation.
          </li>
          <li>
            <strong>recomputePaymentStates</strong> runs inside the 3-hr cron
            and flips Not Due → Due when due_date has passed. Idempotent.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="danger">
        Payments cannot be reversed. Always verify the live IG post via the
        overview-modal link before logging UTR.
      </KMCallout>
    </>
  );
}
