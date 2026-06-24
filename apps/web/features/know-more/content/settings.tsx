import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function SettingsKM() {
  return (
    <>
      <KMHeader
        title="Settings"
        subtitle="Your account at a glance, admin shortcuts, and the two admin-only controls: the Campaign auto-close switch and the Test Mode danger zone. Everything here is gated by the admin permission — non-admins see only their account card."
      />

      <KMSection tag="Your account">
        <KMList>
          <li>
            Read-only identity card — name, email, role chip, and{" "}
            <KMCode>department</KMCode> (when set). All sourced from your{" "}
            <KMCode>user_access</KMCode> row.
          </li>
          <li>
            Name / role / access are managed by a Global Admin in the User
            Panel — there is no self-edit here.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Administration shortcuts">
        <KMList>
          <li>
            <strong>User Panel</strong> · members, roles & permissions (admin
            only).
          </li>
          <li>
            <strong>Sheet View</strong> · spreadsheet grid over the live data,
            including row delete + restore (gated by{" "}
            <KMCode>sheet_view</KMCode>).
          </li>
          <li>
            <strong>Error Portal</strong> · the System Error Log + edge-case
            alerts.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Campaign auto-close (admin)">
        <KMList>
          <li>
            A daily cron auto-closes a campaign once its end date passes. This
            switch pauses that automation (<strong>backlog mode</strong>) so the
            team can keep backfilling collabs into an open campaign.
          </li>
          <li>
            Stored in <KMCode>app_settings</KMCode> under{" "}
            <KMCode>campaign_auto_close_enabled</KMCode> (default ON — only an
            explicit <KMCode>false</KMCode> disables it).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Test Mode — danger zone (admin)">
        <KMList>
          <li>
            Four independent scopes — <strong>Campaigns</strong>,{" "}
            <strong>Creators</strong>, <strong>Collabs</strong>,{" "}
            <strong>Payments</strong>. Turning a scope ON means new rows created
            in that entity are stamped <KMCode>is_test=true</KMCode> — a sandbox
            that never mixes into real reporting.
          </li>
          <li>
            Turning a scope <strong>OFF is destructive</strong>: every{" "}
            <KMCode>is_test</KMCode> row of that entity is first copied into{" "}
            <KMCode>test_mode_archive</KMCode> (full row as jsonb) and then
            deleted. You always see an itemised preview with exact counts before
            confirming.
          </li>
          <li>
            Purge runs in FK-safe order —{" "}
            <KMCode>payments → posts → creators → campaigns</KMCode> — so child
            rows go before the parents they reference.
          </li>
          <li>
            No ID-counter reset needed: Saadaa IDs (SIF inf_id, per-creator
            collab/post number, <KMCode>IFC&#123;NNN&#125;</KMCode>) are derived{" "}
            <KMCode>max+1</KMCode> from the live data, so the next ID
            auto-continues from the remaining real rows after a purge.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Server gate + storage">
        <KMCallout tone="info">
          Every write here calls{" "}
          <KMCode>assertPermission(&apos;system_config&apos;)</KMCode> (admin
          only) via the service-role client. Scope state lives in{" "}
          <KMCode>app_settings.test_mode_scopes</KMCode> as a JSON array string
          (<KMCode>[]</KMCode> = off everywhere); the destructive purge runs in
          the <KMCode>purge_test_rows</KMCode> SECURITY DEFINER RPC
          (archive-then-delete, allowlisted to the four tables).
        </KMCallout>
      </KMSection>
    </>
  );
}
