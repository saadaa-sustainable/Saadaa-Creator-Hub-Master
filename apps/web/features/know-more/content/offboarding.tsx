import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function OffboardingKM() {
  return (
    <>
      <KMHeader
        title="Offboarding"
        subtitle="Creator-level ghosting review and permanent blacklist. The tray shows onboarded creators whose estimated delivery date passed more than 15 days ago and whose posting form is still not submitted. Offboarding is one-way: the creator cannot be reached out or onboarded again."
      />

      <KMSection tag="Who enters the review tray">
        <KMList>
          <li>
            At least one deliverable is still in <KMCode>On Board</KMCode> or{" "}
            <KMCode>Order Sent</KMCode>.
          </li>
          <li>
            Its <KMCode>est_delivery</KMCode> date passed <strong>more than 15
            days ago</strong> in IST (a 15-day grace after the estimated delivery
            date before the creator surfaces here).
          </li>
          <li>
            The Posting form has not been submitted, so the deliverable has not
            moved to <KMCode>Posted</KMCode>.
          </li>
          <li>
            The creator is not already blacklisted. Multiple overdue
            deliverables are grouped into one creator card.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>Filters</strong> — search by creator, handle, or post ID and
            narrow the tray by campaign.
          </li>
          <li>
            <strong>KPIs</strong> — creators needing review, overdue
            deliverables, longest overdue age, and total offboarded creators.
          </li>
          <li>
            <strong>Needs review</strong> — one card per creator, showing the
            overdue age, affected deliverables, campaigns, team owners, and
            earliest missed deadline.
          </li>
          <li>
            <strong>Offboarded</strong> — the permanent blacklist ledger with
            reason, operator, timestamp, and the evidence captured at the time.
          </li>
          <li>
            <strong>Creator overview</strong> — uses the same centered,
            scrollable layout as the Ad Status overview. Long values wrap and
            remain fully readable instead of being shortened with ellipses.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Offboard action">
        <p>
          Open a candidate and choose <strong>Offboard creator</strong>. A clear
          reason of 10 to 1,000 characters is mandatory. The server checks the
          deadline and posting status again immediately before writing, so a
          stale screen cannot blacklist someone whose posting form was just
          completed. The transactional RPC locks the creator and qualifying post
          rows, rebuilds the evidence, updates the blacklist, and fires the
          audit trigger as one operation.
        </p>
        <KMList>
          <li>
            The creator row receives <KMCode>is_blacklisted = true</KMCode>, the
            reason, actor email, timestamp, and a JSON evidence snapshot.
          </li>
          <li>
            Existing post and payment rows are not rewritten or deleted. The
            blacklist belongs to the creator, not to one collab.
          </li>
          <li>
            There is no restore button. Any correction requires an intentional
            admin data operation.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Permanent enforcement">
        <KMList>
          <li>
            Outbound and inbound Instagram lookups return an immediate red
            Offboarded result with the recorded reason. A known blocked handle
            is rejected before a Meta request is spent.
          </li>
          <li>
            Both Reach Out submit paths check the blacklist again on the server,
            so stale forms and direct action calls cannot bypass it.
          </li>
          <li>
            Onboarding performs the same server-side check by creator ID and
            username before campaign-cap or Shopify work begins.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Audit and access">
        <KMList>
          <li>
            The database trigger writes one append-only row to{" "}
            <KMCode>creator_audit_log</KMCode> in the same transaction as the
            blacklist update. It records the creator, reason, actor, evidence,
            and timestamp.
          </li>
          <li>
            Creator events appear under the <strong>Creator</strong> source in
            Audit Log.
          </li>
          <li>
            Viewing and acting on this page require{" "}
            <KMCode>offboarding_write</KMCode>. The audit table is service-role
            only and append-only for the application.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Offboarding is a permanent creator decision, not a way to close one bad
        collaboration. Review every overdue deliverable and write a reason the
        next operator can understand before confirming.
      </KMCallout>
    </>
  );
}
