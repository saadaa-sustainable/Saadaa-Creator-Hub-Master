import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function PostingKM() {
  return (
    <>
      <KMHeader
        title="Posting"
        subtitle="Log the live IG content per deliverable — link, post date, raw footage, partnership key. Flips workflow to Posted."
      />

      <KMSection tag="Purpose">
        <p>
          Posting is the proof-of-life step. Each deliverable row (parent +
          children) needs its IG link and post date logged before payment can
          be released. The form auto-decodes the post date from the IG
          shortcode (no API call) and prompts you to verify before submit.
        </p>
      </KMSection>

      <KMSection tag="Fields written">
        <KMList>
          <li>
            <strong>posts</strong> · workflow_status <KMCode>Posted</KMCode>,
            post_link, post_date, download_link (raw IG download), raw_dump
            (Drive footage folder), partnership_id, ad_partnership_valid
            (derived from partnership_id presence).
          </li>
          <li>
            <strong>payments</strong> · auto-init draft row (status{" "}
            <KMCode>Not Due</KMCode>, due_date = post_date + 30, est_payable =
            next 15th/30th cycle) — created ONLY when the whole collab is
            payment-eligible (see Rules).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Auto post-date decode">
        <p>
          The IG shortcode contains the post&apos;s creation timestamp
          (Instagram snowflake ID). The form decodes it via{" "}
          <KMCode>(id &gt;&gt; 23) + 1314220021721</KMCode> and pre-fills the
          date. The 3-hour cron also backfills any Posted rows that slipped
          through without a date.
        </p>
      </KMSection>

      <KMSection tag="URL ownership check">
        <p>
          The form parses the username from the pasted IG URL and compares it
          to the creator&apos;s handle. Bare <KMCode>/p/</KMCode> URLs that
          don&apos;t expose a username require an explicit{" "}
          <KMCode>&quot;I confirm this is the creator&apos;s post&quot;</KMCode>{" "}
          tickmark. Same-domain mismatches are blocked outright.
        </p>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Partnership key is required when ads_usage_rights = Yes. The form
            blocks submit until it&apos;s set.
          </li>
          <li>
            Date drift of ±1 day is possible — IG snowflake ≠ publish time. The
            verify tickmark forces a manual check.
          </li>
          <li>
            Children (P2, P3, …) submit independently. The parent stays in
            Posted; children appear inside the overview modal.
          </li>
          <li>
            Re-submitting overwrites previous values (post_link, post_date,
            raw_dump). Audit log preserved.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Auto-init of the payment draft is GATED — the whole collab must have
        every sibling posted AND no missing partnership keys before any
        payment row appears in Accounts Hub.
      </KMCallout>
    </>
  );
}
