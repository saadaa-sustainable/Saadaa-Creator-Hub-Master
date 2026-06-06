import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function OffboardingKM() {
  return (
    <>
      <KMHeader
        title="Offboarding"
        subtitle="Terminal stage for collabs that have run their course. A parked collab leaves the active pipeline but stays visible in Accounts Hub until the creator is fully paid. Manual, one-way transition gated to authorized operators."
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
            <strong>3. Move to Offboarding panel</strong> — enter a Post ID and
            confirm to park the whole collab episode here.
          </li>
          <li>
            <strong>4. KPI strip</strong> — Offboarding count · Awaiting
            Payment · Fully Paid · Committed Spend.
          </li>
          <li>
            <strong>5. Board</strong> — list table or cards grid (mobile auto-
            switches to Cards) of every collab currently in Offboarding.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> · every row with{" "}
            <KMCode>workflow_status = &apos;Offboarding&apos;</KMCode> AND{" "}
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

      <KMSection tag="The Offboarding transition">
        <p>
          Use the Move panel: paste the collab&apos;s Post ID and confirm. The
          server action sets <KMCode>workflow_status = &apos;Offboarding&apos;</KMCode>{" "}
          on every deliverable that shares the collab&apos;s{" "}
          <KMCode>(inf_id, collab_number)</KMCode>, so the whole episode moves
          together. Payment status is left untouched — the collab keeps
          appearing in Accounts Hub until it is paid.
        </p>
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
            Awaiting Payment counts any collab whose payment_status is not{" "}
            <KMCode>Done</KMCode>; those rows still surface in Accounts Hub.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Offboarding is the end of a creator relationship for a given collab.
        Settle payments in Accounts Hub first; this stage is the record that
        the collaboration is closed out.
      </KMCallout>
    </>
  );
}
