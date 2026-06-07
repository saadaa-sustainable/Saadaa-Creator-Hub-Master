import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function CampaignsKM() {
  return (
    <>
      <KMHeader
        title="Campaigns"
        subtitle="Server-generated IFC IDs. Two budget lines (Barter + Paid) seed automatically. Tabs for Create + Existing in one switcher."
      />

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>Create Campaign</strong> tab — form for campaign details
            and budget rows.
          </li>
          <li>
            <strong>Existing Campaigns</strong> tab — list of all campaigns
            with quick links back into the form for editing.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Fields written (campaigns table)">
        <KMList>
          <li>
            <strong>campaign_id</strong> · auto <KMCode>IFC###</KMCode> — server
            assigns the next free integer. You never type this.
          </li>
          <li>
            <strong>campaign_name</strong> · operator-facing label shown in
            every dropdown across reach-out, onboarding, accounts hub.
          </li>
          <li>
            <strong>key_message</strong> · single line summarising the angle.
            Surfaces inside the collab brief email.
          </li>
          <li>
            <strong>start_date · end_date</strong> · planning window — both
            required. Drives dashboard active-campaign badge, burn-rate charts,
            and the auto-close on end date.
          </li>
          <li>
            <strong>creator_target · brief_link · internal_brief</strong> ·
            target headcount + external/internal brief URLs.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Budget rows (campaign_budget)">
        <p>
          On Add the form auto-appends two rows: one{" "}
          <KMCode>collab_type=Barter</KMCode> and one{" "}
          <KMCode>collab_type=Paid</KMCode>. Adjust or delete to make the
          campaign fully one type.
        </p>
        <KMList>
          <li>
            <strong>Barter</strong> rows lock <KMCode>avg_compensation</KMCode>{" "}
            + commercials to 0 (read-only field) — Saadaa never pays cash on
            barter.
          </li>
          <li>
            <strong>Paid</strong> rows accept any positive avg compensation;
            roll up into <KMCode>campaign_budget_monthly</KMCode> view for
            trend charts (auto-regenerated, don&apos;t edit directly).
          </li>
          <li>
            <strong>Creator cap</strong> — the sum of{" "}
            <KMCode>num_influencers</KMCode> across these rows is the campaign&apos;s
            creator cap: Reach Out blocks new creators once the campaign is full.
            The campaign card + detail show <strong>used / cap</strong> (distinct
            active creators ÷ allocation). Raising a row&apos;s count raises both
            the cap and the budget. Edit the rows (Campaign Owner / Global Admin)
            to widen or narrow it.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Edit campaign">
        <p>
          Each campaign card and the detail modal carry an <strong>Edit</strong>{" "}
          button that reopens the form pre-filled. Editing updates the name,
          start/end dates, briefs (key message, brief links), and the
          creator-count + budget rows.
        </p>
        <KMCallout tone="warning">
          Changing avg-comp or creator-count does <strong>not</strong>{" "}
          retroactively change the commercials on existing posts, and{" "}
          <strong>never</strong> touches paid posts. If reach-outs are already
          tied to the campaign, a warning surfaces before the update saves.
        </KMCallout>
      </KMSection>

      <KMSection tag="Status + lifecycle">
        <KMList>
          <li>
            Every campaign carries a <KMCode>status</KMCode> — <strong>Active</strong>{" "}
            or <strong>Closed</strong> — shown as a pill on the card + detail.
          </li>
          <li>
            <strong>Auto-close:</strong> once a campaign&apos;s end date passes,
            the daily job flips it to <strong>Closed</strong> (one-shot, stamped
            via <KMCode>auto_closed_at</KMCode>).
          </li>
          <li>
            <strong>Reopen:</strong> a Campaign Owner or Global Admin can reopen
            a closed campaign from the card&apos;s <strong>Reopen</strong> button.
            A reopened campaign stays Active and is never auto-closed again.
          </li>
          <li>
            <strong>Close manually:</strong> the same managers can close an
            Active campaign early via the <strong>Close</strong> button.
          </li>
          <li>
            <strong>Closed = no new reach-outs.</strong> A closed (or
            auto-closed) campaign rejects new creators in both Outbound and
            Inbound reach-out — reopen it to add more.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Campaign ID is immutable once created. Rename / archive freely;
            historical posts keep their link.
          </li>
          <li>
            Deleting a campaign is blocked while any posts reference it (FK
            constraint). Archive instead.
          </li>
          <li>
            Editing an existing campaign re-uses the same form via the
            switcher tab — the create button text flips to &quot;Update&quot;.
          </li>
          <li>
            Red <KMCode>MissingFieldsAlert</KMCode> sits above the submit
            button listing every missing required column (Campaign Name, Key
            Message, Brief Link, Budget Rows etc.) using live Zod{" "}
            <KMCode>safeParse(watch())</KMCode> validation.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Campaign management is restricted to the <strong>Campaign Owner</strong>{" "}
        role and <strong>Global Admin</strong>. Create needs{" "}
        <KMCode>campaign_create</KMCode>; edit / close / reopen need{" "}
        <KMCode>campaign_edit</KMCode>. Everyone else sees campaigns read-only
        (no New / Edit / Close buttons). The creator is stamped as the campaign
        owner and receives the &quot;ending soon&quot; alert.
      </KMCallout>
    </>
  );
}
