import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function ErrorsKM() {
  return (
    <>
      <KMHeader
        title="Error Portal"
        subtitle="System error log. Data quality issues, workflow edge cases, API failures, and missing required data — all in one place."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — ShieldAlert icon + title + Know More button.
          </li>
          <li>
            <strong>2. KPI strip</strong> — Email Blocked · CRITICAL · WARNING ·
            INFO · API Failures · Meta Fetch Fails · Profile Unavailable ·
            Missing Email. Counts of unresolved errors per category. The two
            Reach Out lookup KPIs split the cases the team triages separately:{" "}
            <KMCode>meta_fetch_failed</KMCode> (the Meta API itself errored —
            rate-limit / network / token, retry) vs{" "}
            <KMCode>meta_profile_unavailable</KMCode> (API worked but the handle
            is private / personal / deactivated). Both are logged from the Reach
            Out Fetch and deduped per handle. <strong>Email Blocked</strong> is
            clickable — it jumps to the Collab Emails Blocked card.
          </li>
          <li>
            <strong>3. Filter strip</strong> — category, resolved status, date range.
          </li>
          <li>
            <strong>4. Error table</strong> — one row per error: type, key, message,
            source, created_at, resolved toggle.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Error categories">
        <KMList>
          <li>
            <strong>CRITICAL</strong> · blocking workflow errors (missing required
            fields, failed payment records, broken integrations). Shown as sidebar badge.
          </li>
          <li>
            <strong>WARNING</strong> · non-blocking but important (overdue payments,
            stale data, near-threshold limits).
          </li>
          <li>
            <strong>INFO</strong> · informational notices (sync completions, skipped
            records with reason).
          </li>
          <li>
            <strong>API_FAILS</strong> · failed external API calls (Shopify, Apify,
            GoKwik). Includes retry count and last attempt timestamp.
          </li>
          <li>
            <strong>MISSING_EMAIL</strong> · collabs where email is required but missing,
            blocking collab confirmation sends.
          </li>
          <li>
            <strong>EMAIL BLOCKED</strong> · the collab email send gate refused to
            send because a required attachment (Campaign Brief or T&amp;C) or the
            sender CC was missing (<KMCode>collab_email_blocked</KMCode>), or the
            SMTP send failed (<KMCode>collab_email_send_failed</KMCode>).{" "}
            <strong>No email reaches the creator</strong> in either case. Each row
            has a <KMCode>Send again</KMCode> button that rebuilds the email from
            the live preview (picking up a since-fixed brief / T&amp;C / email)
            and retries; on success the error auto-resolves and drops off.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Resolving errors">
        <p>
          Use the <KMCode>Mark Resolved</KMCode> toggle on any row to dismiss it from
          the active view. Resolved errors remain in the table and are filterable —
          they are never deleted. The sidebar badge shows only unresolved CRITICAL
          errors.
        </p>
      </KMSection>

      <KMSection tag="Error source">
        <p>
          Errors are written to the <KMCode>system_errors</KMCode> Supabase table by
          backend functions, cron jobs, and edge functions. The{" "}
          <KMCode>source</KMCode> column identifies which process generated the error.
          Common sources: <KMCode>sync-shopify</KMCode>,{" "}
          <KMCode>apify-enrichment</KMCode>, <KMCode>payment-processor</KMCode>,{" "}
          <KMCode>collab-email</KMCode>.
        </p>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>system_errors</strong> · type, key, message, source,
            created_at, resolved, resolved_at, resolved_by.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="danger">
        CRITICAL errors require immediate attention — they indicate broken workflow
        steps. The sidebar badge counts unresolved CRITICALs so you can spot issues
        without opening this page.
      </KMCallout>
    </>
  );
}
