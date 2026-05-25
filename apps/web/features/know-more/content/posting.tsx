import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function PostingKM() {
  return (
    <>
      <KMHeader
        title="Posting"
        subtitle="Log live IG content per deliverable. Auto-decoded post date, ownership verification, partnership key, raw-footage drop."
      />

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>Filter bar</strong> — campaign · stage · tier · ads rights
            · onboarded from/to dates.
          </li>
          <li>
            <strong>List / Cards toggle</strong> — both surfaces share the
            same filter strip and per-row Submit / Overview action.
          </li>
          <li>
            <strong>Submit Posting modal</strong> — opens per row. Form has a
            Verify Strip at the top (date pill + URL pill + ownership
            tickmark), then download / raw-dump / partnership rows below.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Verify Strip">
        <KMList>
          <li>
            <strong>Post Date pill</strong> — auto-decoded from the IG
            shortcode via <KMCode>(id &gt;&gt; 23) + 1314220021721</KMCode>.
            Carries a <KMCode>±1d</KMCode> note because the snowflake
            timestamp is the IG ID-mint time, not the publish time.
          </li>
          <li>
            <strong>URL pill</strong> — parses the username from the pasted
            link. Same handle as the creator = green ok pill. Same-domain
            mismatch = blocked outright.
          </li>
          <li>
            <strong>Ownership tickmark</strong> — required for bare{" "}
            <KMCode>/p/</KMCode> URLs that don&apos;t expose a username.
            Operator must check &quot;I confirm this is the creator&apos;s
            post.&quot;
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Fields written">
        <KMList>
          <li>
            <strong>posts</strong> · workflow_status <KMCode>Posted</KMCode>,
            post_link, post_date, download_link (raw IG download URL),
            raw_dump (Drive footage folder), partnership_id,
            ad_partnership_valid (derived from partnership_id presence).
          </li>
          <li>
            <strong>payments</strong> · auto-init draft row (status{" "}
            <KMCode>Not Due</KMCode>, due_date = post_date + 30, est_payable
            = next 15th/30th cycle) — created ONLY when the whole collab is
            payment-eligible (see Auto-Init Gate).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Auto-Init Gate (autoInitDraftPayment)">
        <p>
          Draft payment rows only spawn when every sibling deliverable in the
          collab has both post_link AND post_date, AND no sibling with
          ads_usage_rights=Yes is missing a partnership_id. Prevents
          UTR-less ghost rows in Accounts Hub before the collab is actually
          payable.
        </p>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Partnership key is required when ads_usage_rights = Yes. Submit
            blocks until it&apos;s set.
          </li>
          <li>
            Date drift of ±1 day is real (snowflake ≠ publish time). The
            verify tickmark forces a human check.
          </li>
          <li>
            Children submit independently. The parent row stays in Posted;
            children appear inside the Posting overview modal.
          </li>
          <li>
            Re-submit overwrites post_link / post_date / raw_dump /
            download_link / partnership_id. Audit trail preserved via
            updated_at.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        The 3-hr Apify cron also runs <KMCode>backfillPostDates</KMCode> over
        any Posted rows that slipped through with NULL post_date, decoding
        from the shortcode automatically.
      </KMCallout>
    </>
  );
}
