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

      <KMSection tag="Budget first, campaign second">
        <KMList>
          <li>
            <strong>Budget approvals</strong> (a new campaign&apos;s V0 or a
            top-up) are decided by <strong>Global Admins only</strong> — akshay
            · mahesh · devesh. Admins see the cards read-only. Top-up cards
            show the requester&apos;s reason for the increase.
          </li>
          <li>
            A campaign card stays <strong>locked</strong> (&quot;Approve the
            budget first&quot;) until its V0 budget is approved; rejecting a V0
            rejects the campaign with it. All other approvals (campaign,
            campaign edits, onboarding edits) belong to the Admins — Global
            Admins can do those too.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>List / Cards toggle</strong> — the queue opens as a{" "}
            <strong>compact list</strong> by default: one row per pending item
            with the key number (amount / fields changed) and inline Approve /
            Reject; the chevron expands a row to the full detail (budget
            split, before/after table, overview buttons). Switch to Cards for
            the full-size cards; your choice is remembered on this device.
          </li>
          <li>
            <strong>KPI tiles</strong> — Awaiting approval · Campaigns · Σ Budget ·
            Σ Creators across the queue.
          </li>
          <li>
            <strong>Campaign cards</strong> — name + id, owner, created date, key
            message, budget / creators / dates, and the campaign brief link.
          </li>
          <li>
            <strong>Budget cards</strong> — amount / creators / month, the
            tier-wise budget split (with a TOTAL row), plus{" "}
            <strong>Campaign Overview</strong>, <strong>Campaign Brief</strong>{" "}
            and <strong>Edit campaign</strong> buttons. Edit opens the full
            campaign edit form <em>right here in a popup</em> — no detour to
            the Campaigns page — and the queue refreshes when you save.
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
