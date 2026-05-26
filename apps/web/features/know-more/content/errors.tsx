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
            <strong>2. KPI strip</strong> — CRITICAL · WARNING · INFO · API Failures ·
            Missing Email. Counts of unresolved errors per category.
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
