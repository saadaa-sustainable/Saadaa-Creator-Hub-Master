import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function AuditLogKM() {
  return (
    <>
      <KMHeader
        title="Audit Log"
        subtitle="One reverse-chronological stream of who did what, when — Sheet edits, creator offboarding, deletions, user and access changes, and system errors — for accountability and debugging."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — ScrollText icon + title + Know
            More.
          </li>
          <li>
            <strong>2. Source tiles</strong> — clickable filters: All events ·
            Sheet View · Creator · Users &amp; Access · System. Each shows the
            live count; the active tile is outlined. Click to scope the stream.
          </li>
          <li>
            <strong>3. Search</strong> — free-text over actor, action, target
            and detail.
          </li>
          <li>
            <strong>4. Event list</strong> — one row per event: a source badge,
            the action (with a coloured tone dot), the target (table · key), the
            actor, an optional detail (the change diff / message), and the IST
            timestamp.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Sources">
        <KMList>
          <li>
            <strong>Sheet View</strong> · cell edits (<KMCode>old → new</KMCode>
            ), comments (raised / resolved), and row deletions / restores from
            the Sheet View grid.
          </li>
          <li>
            <strong>Creator</strong> · permanent creator offboarding events from{" "}
            <KMCode>creator_audit_log</KMCode>, including the reason, operator,
            evidence snapshot, and timestamp.
          </li>
          <li>
            <strong>Users &amp; Access</strong> · invites, role changes,
            activations / deactivations — from <KMCode>user_audit_log</KMCode>.
          </li>
          <li>
            <strong>System</strong> · entries from the Error Portal log (
            <KMCode>system_errors</KMCode>) — raised and resolved.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Tone dots">
        <p>
          The small dot on each action hints at the kind of change:{" "}
          <KMCode>create</KMCode> / <KMCode>resolve</KMCode> (green),{" "}
          <KMCode>change</KMCode> (amber), <KMCode>delete</KMCode> (red), and{" "}
          <KMCode>neutral</KMCode> (restores, comments).
        </p>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>cell_edits</strong>, <strong>cell_comments</strong>,{" "}
            <strong>row_deletions</strong> — Sheet activity.
          </li>
          <li>
            <strong>creator_audit_log</strong> — append-only creator blacklist
            history.
          </li>
          <li>
            <strong>user_audit_log</strong> — user / role / access changes.
          </li>
          <li>
            <strong>system_errors</strong> — the Error Portal log.
          </li>
        </KMList>
        <p>
          Read-only; each source is capped at 500 recent rows and merged newest
          first. Nothing here is ever edited or deleted from this page.
        </p>
      </KMSection>

      <KMCallout tone="info">
        Admin-only. The Audit Log answers &quot;who changed this, and when&quot;
        — pair it with the Error Portal (to act on system errors) and the User
        Panel (to manage who has access).
      </KMCallout>
    </>
  );
}
