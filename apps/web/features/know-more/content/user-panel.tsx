import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function UserPanelKM() {
  return (
    <>
      <KMHeader
        title="User Panel"
        subtitle="Members directory + custom role builder. Linear / Slack-grade enterprise UX with audit log, last-active sparklines, CSV bulk invite, and a permission matrix Global Admins can edit live."
      />

      <KMSection tag="Two tabs">
        <KMList>
          <li>
            <strong>Members</strong> · table + card view of every row in{" "}
            <KMCode>user_access</KMCode>. Search by name / email / notes; filter
            by role, status, and last-active window (today / 7 / 30 / stale /
            never).
          </li>
          <li>
            <strong>Roles & Permissions</strong> · card grid of every role from{" "}
            <KMCode>access_roles</KMCode>. System roles (Global Admin · User ·
            Accounts Team · Campaign Owner) ship locked but tunable. Campaign
            Owner creates/edits/closes/reopens campaigns (campaign management is
            this role + Global Admin only). Custom roles can be
            created, edited, deleted (after reassigning users).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Hero band + KPI strip">
        <KMList>
          <li>
            <strong>Members</strong> · total <KMCode>user_access</KMCode> rows.
          </li>
          <li>
            <strong>Active</strong> · rows where <KMCode>active=true</KMCode>.
          </li>
          <li>
            <strong>Admins</strong> · rows where role normalises to{" "}
            <KMCode>Global Admin</KMCode>.
          </li>
          <li>
            <strong>Accounts</strong> · rows on the Accounts Team role.
          </li>
          <li>
            <strong>Pending</strong> · active rows where{" "}
            <KMCode>last_login_at IS NULL</KMCode> — invited but never logged in.
          </li>
          <li>
            <strong>Online today</strong> · rows where{" "}
            <KMCode>last_active_at</KMCode> falls on the current IST date.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Member rows">
        <KMList>
          <li>
            <strong>Avatar</strong> · hash-derived gradient circle + status dot
            (green = active, grey = inactive).
          </li>
          <li>
            <strong>Role chip</strong> · uses the role&apos;s custom color from{" "}
            <KMCode>access_roles.color</KMCode>; falls back to brand defaults for
            system roles.
          </li>
          <li>
            <strong>Activity sparkline</strong> · 30-day bar chart aggregated
            from posts the user onboarded, payments they logged, and Sheet View
            comments they authored.
          </li>
          <li>
            <strong>Awaiting login</strong> · warning chip surfaces for active
            users with no <KMCode>last_login_at</KMCode>.
          </li>
          <li>
            <strong>Deep link</strong> ·{" "}
            <KMCode>/admin/users?focus=email@x.com</KMCode> auto-opens the edit
            modal — paste-from-Linear-style.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Detail page · /admin/users/[email]">
        <KMList>
          <li>
            Identity card with quick Activate / Edit / Delete actions, joined
            date, invited-by, last login.
          </li>
          <li>
            30-day activity panel with a wide sparkline + touch count.
          </li>
          <li>
            <strong>Permissions matrix</strong> · live-resolved from{" "}
            <KMCode>access_role_permissions</KMCode> for the user&apos;s role,
            rendered as a 2-column granted/denied grid with descriptions.
          </li>
          <li>
            <strong>Audit log timeline</strong> · every invite / edit /
            role_change / activate / deactivate / delete / login /
            csv_invite_batch event with diff preview (before → after) and the
            acting admin.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Custom roles">
        <KMList>
          <li>
            <strong>Create role</strong> · name + description + accent color
            swatch picker + 8-permission checkbox matrix.
          </li>
          <li>
            <strong>Permission scopes</strong> · <KMCode>admin</KMCode> ·{" "}
            <KMCode>campaign_create</KMCode> ·{" "}
            <KMCode>reachout_outbound</KMCode> ·{" "}
            <KMCode>reachout_inbound</KMCode> ·{" "}
            <KMCode>onboarding_write</KMCode> ·{" "}
            <KMCode>posting_submit</KMCode> ·{" "}
            <KMCode>accounts_write</KMCode> ·{" "}
            <KMCode>performance_view</KMCode>.
          </li>
          <li>
            <strong>Rename cascade</strong> · renaming a custom role updates
            every <KMCode>user_access.role</KMCode> automatically.
          </li>
          <li>
            <strong>System roles</strong> · name locked, deletion locked,
            permissions still tunable.
          </li>
          <li>
            <strong>Delete guard</strong> · custom roles only delete when zero
            users still reference them.
          </li>
          <li>
            <strong>Audit propagation</strong> · permission changes on a role
            log an audit event for every assigned user so the detail-page feed
            reflects the change.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Server-side gate (lib/rbac.ts)">
        <KMCallout tone="info">
          <KMCode>getActor</KMCode> hydrates <KMCode>permissions: string[]</KMCode>{" "}
          per request from the DB. <KMCode>hasPermission</KMCode> trusts that
          array first, falling back to a static role grant map only if the
          array is empty (covers tests + the brief window before the migration
          applies). Server actions call{" "}
          <KMCode>assertPermission(&apos;admin&apos;)</KMCode> etc. — they only
          look at the hydrated scopes.
        </KMCallout>
      </KMSection>

      <KMSection tag="Bulk invite (CSV / paste)">
        <KMList>
          <li>
            Paste rows directly from Excel or Sheets. Header auto-detected.
            Columns: <KMCode>email</KMCode>, <KMCode>name</KMCode>,{" "}
            <KMCode>role</KMCode>, <KMCode>notes</KMCode>.
          </li>
          <li>
            Role aliases accepted: <KMCode>admin</KMCode>,{" "}
            <KMCode>owner</KMCode>, <KMCode>member</KMCode>,{" "}
            <KMCode>team</KMCode>, <KMCode>finance</KMCode>,{" "}
            <KMCode>accounts</KMCode>.
          </li>
          <li>
            Result summary surfaces invited / updated / failed counts with
            per-row error details.
          </li>
          <li>
            Whole batch logged as a{" "}
            <KMCode>csv_invite_batch</KMCode> audit event.
          </li>
          <li>
            New + active rows also trigger the invitation email (below); the
            summary reports an <KMCode>emailed</KMCode> count.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Invitation email">
        <KMList>
          <li>
            Inviting a <strong>new, active</strong> user (single or CSV) sends a
            branded email to that address, logged to{" "}
            <KMCode>email_logs</KMCode> as <KMCode>user_invitation</KMCode>.
          </li>
          <li>
            CreatorHub is <strong>Google sign-in only</strong> — there is no
            password and no accept link. The email tells the invitee to sign in
            with the Google account for their address at{" "}
            <KMCode>/login</KMCode>.
          </li>
          <li>
            Access is already live the moment they sign in: the OAuth callback
            matches their Google email to their (active) <KMCode>user_access</KMCode>{" "}
            row. No token, no provisioning step.
          </li>
          <li>
            Best-effort: a failed send never blocks the invite (the row is still
            created); the failure is recorded in <KMCode>email_logs</KMCode>.
            Requires the <KMCode>EMAIL_*</KMCode> SMTP env.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Tables touched">
        <KMList>
          <li>
            <strong>user_access</strong> ·{" "}
            <KMCode>id, email, name, role, active, notes, invited_by,
            invited_at, last_login_at, last_active_at, created_at</KMCode>.
          </li>
          <li>
            <strong>access_roles</strong> ·{" "}
            <KMCode>id, name, description, is_system, color, created_by,
            created_at, updated_at</KMCode>.
          </li>
          <li>
            <strong>access_role_permissions</strong> ·{" "}
            <KMCode>(role_id, scope, granted)</KMCode>.
          </li>
          <li>
            <strong>user_audit_log</strong> · append-only with{" "}
            <KMCode>actor_email, target_email, action, before_json, after_json,
            notes, created_at</KMCode>.
          </li>
          <li>
            <strong>access_role_summary</strong> view · rollup of granted_count
            + user_count per role.
          </li>
        </KMList>
      </KMSection>
    </>
  );
}
