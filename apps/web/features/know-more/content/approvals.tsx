import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function ApprovalsKM() {
  return (
    <>
      <KMHeader
        title="Approvals"
        subtitle="Admin sign-off queue. New campaigns land here as Pending Approval and only go live once an admin approves them."
      />

      <KMSection tag="What it gates">
        <p>
          When a campaign is created it is stamped{" "}
          <KMCode>Pending Approval</KMCode> instead of going live. Until an admin
          acts on it, the campaign is <strong>hidden from every picker</strong>{" "}
          (reach-out, onboarding) and reach-outs against it are rejected.
        </p>
      </KMSection>

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>KPI tiles</strong> — Awaiting approval · Campaigns · Σ Budget ·
            Σ Creators across the queue.
          </li>
          <li>
            <strong>Campaign cards</strong> — name + id, owner, created date, key
            message, budget / creators / dates, and the campaign brief link.
          </li>
          <li>
            <strong>Edit-request cards</strong> (campaign edits and onboarding
            edits) — show a <strong>Field / Before / After</strong> table of
            exactly what changes, so you can decide without opening anything
            else. Approving applies the new values; rejecting leaves the
            original untouched.
          </li>
          <li>
            <strong>Approval History</strong> — every past decision. Clicking a
            campaign-edit or onboarding-edit row opens a popup with the same
            Before/After breakdown that was decided on.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Approve / Reject">
        <KMList>
          <li>
            <strong>Approve</strong> · flips <KMCode>Pending Approval</KMCode> →{" "}
            <KMCode>Active</KMCode> (atomic — a double-approve is a no-op). The
            campaign immediately appears in pickers and accepts reach-outs.
          </li>
          <li>
            <strong>Reject</strong> · flips → <KMCode>Rejected</KMCode> with an
            optional reason. Rejected campaigns stay out of every picker.
          </li>
          <li>
            Every decision is written to <KMCode>approval_logs</KMCode> (admin +
            timestamp + reason) and surfaces in the <strong>Audit Log</strong>{" "}
            under the Approvals source.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>campaigns</strong> · status, budget, creators, dates, owner.
          </li>
          <li>
            <strong>approval_logs</strong> · the approve / reject audit trail.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Admin-only. Campaigns created before this gate, and any reopened campaign,
        stay Active — only NEW campaigns route through approval.
      </KMCallout>
    </>
  );
}
