import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function OffboardingKM() {
  return (
    <>
      <KMHeader
        title="Offboarding"
        subtitle="Terminal stage that VOIDS a collab — we are not continuing with the creator for it. A voided collab is removed from every other surface (boards, kanban cards, dashboards, the Accounts Hub Due list), so its leftover balance can never be paid. Money already disbursed is kept as history. Manual, one-way, gated to authorized operators."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — Offboarding title + Know More
            button.
          </li>
          <li>
            <strong>2. Filter strip</strong> — search (name / handle / order
            ID / campaign), campaign, payment status. URL-driven so views are
            shareable; a <KMCode>Clear filters</KMCode> ghost button appears
            once any filter is active.
          </li>
          <li>
            <strong>3. Move to Offboarding panel</strong> — pick a collab from
            the Collab ID dropdown and confirm to park the whole collab episode
            here.
          </li>
          <li>
            <strong>4. KPI strip</strong> — Offboarding count · Awaiting
            Payment · Fully Paid · Committed Spend.
          </li>
          <li>
            <strong>5. Board</strong> — list table or cards grid (mobile auto-
            switches to Cards) of every offboarded collab. Click any card or row
            to open the <strong>Offboarding Overview</strong> popup with the full
            collab detail (deliverables as <KMCode>1P : 1R</KMCode>, dates,
            order, payment, links).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> · every row with{" "}
            <KMCode>workflow_status = &apos;Offboarded&apos;</KMCode> AND{" "}
            <KMCode>deliverable_index</KMCode> in (null, 1). Child deliverables
            are folded into the parent so each card is one collab.
          </li>
          <li>
            <strong>creators</strong> · inf_name, profile_pic, category,
            followers for the cells + avatars.
          </li>
          <li>
            <strong>instagram_cache</strong> · fallback profile_pic when the
            creators row isn&apos;t enriched yet.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="The Offboarding transition (void)">
        <p>
          Use the Move panel: pick the collab from the <strong>Collab ID</strong>{" "}
          dropdown (active collabs only) and confirm. The server action sets{" "}
          <KMCode>workflow_status = &apos;Offboarded&apos;</KMCode> on every
          deliverable that shares the collab&apos;s{" "}
          <KMCode>(inf_id, collab_number)</KMCode>, so the whole episode voids
          together.
        </p>
        <KMList>
          <li>
            <strong>Removed everywhere</strong> · the shared{" "}
            <KMCode>isVoidedStatus</KMCode> filter drops the collab from the
            Accounts Hub board + Due CSV, Order Status, Influencer Journey, and
            every dashboard / analytics view. Its remaining balance can no longer
            be paid — exactly the point of voiding.
          </li>
          <li>
            <strong>Paid history kept</strong> · payment rows are never deleted
            or altered. Money already disbursed (e.g. a partial installment
            before a dispute) stays in the DB, the Sheet View Payments tab, and
            the Accounts <KMCode>Paid</KMCode> / <KMCode>All</KMCode> CSV exports
            (which opt in via <KMCode>includeVoided</KMCode>).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Permissions">
        <KMList>
          <li>
            The page and the move action both require the{" "}
            <KMCode>offboarding_write</KMCode> scope. Global Admins hold it by
            default, so it stays admin-only until the custom{" "}
            <KMCode>Offboarding Manager</KMCode> role is assigned to someone.
          </li>
          <li>
            Operators without the scope never see the sidebar entry and are
            redirected away from the route — this is purely additive, no
            existing access is removed.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Terminal + one-way. There is no revert control on this screen by
            design; correcting a mistaken move is an explicit data operation.
          </li>
          <li>
            Committed Spend sums the agreed per-collab commercials (Σ
            commercial_amount per inf_id + collab_number), not the equal-split
            per-row value.
          </li>
          <li>
            Awaiting Payment counts any voided collab whose payment_status is
            not <KMCode>Done</KMCode> — money that was owed but, because the
            collab is voided, will <strong>not</strong> be paid (it no longer
            appears on the Accounts Hub Due list). This KPI is a record on the
            Offboarding page only.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Offboarding voids a collab: it disappears from every active surface and
        its leftover balance becomes unpayable. If you need to pay part of it
        first, do that in Accounts Hub <strong>before</strong> voiding — already
        disbursed money is kept as history afterwards.
      </KMCallout>
    </>
  );
}
