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
            <strong>Submission toggle</strong> — a two-state segment at the
            top of the filter bar. <KMCode>Not Submitted</KMCode> (the default
            on load) shows the posting work queue (workflow_status{" "}
            <KMCode>On Board / Order Sent</KMCode> — form not yet filled);{" "}
            <KMCode>Submitted</KMCode> shows posted rows (<KMCode>Posted</KMCode>).
            The Stage dropdown still narrows within the chosen side.
          </li>
          <li>
            <strong>Filter bar</strong> — <strong>search</strong> (id / name /
            username / IG URL / post link, debounced) · campaign · tier · ads
            rights · <strong>Onboarded by</strong> (the team member who onboarded
            the collab, from <KMCode>onboarded_by</KMCode>) ·{" "}
            <strong>Content Type</strong> · onboarded from/to dates.
          </li>
          <li>
            <strong>List / Cards toggle</strong> — both surfaces share the
            same filter strip + per-row action.
          </li>
          <li>
            <strong>Per-row action</strong> — <KMCode>Submit</KMCode> button
            on unposted rows (opens Submit Posting modal); switches to{" "}
            <KMCode>Overview</KMCode> (eye icon) once posted, opening a
            read-only summary of every field that was submitted.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="KPIs">
        <p>
          A KPI strip sits above the board. Every tile counts{" "}
          <strong>post IDs</strong> — one row is one deliverable, so the counts
          are deliverable counts, not a reels + static + stories sum:
        </p>
        <KMList>
          <li>
            <strong>Posts Due</strong> — post IDs yet to be submitted
            (<KMCode>On Board</KMCode> / <KMCode>Order Sent</KMCode>).
          </li>
          <li>
            <strong>Submitted</strong> — post IDs already posted
            (<KMCode>Posted</KMCode>).
          </li>
          <li>
            <strong>Completion Rate</strong> — Submitted ÷ (Submitted + Due) =
            Submitted ÷ total post IDs.
          </li>
          <li>
            <strong>Delayed</strong> — posted post IDs whose{" "}
            <KMCode>post_date</KMCode> is later than the row&apos;s{" "}
            <KMCode>est_delivery</KMCode>.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Submit Posting modal layout">
        <KMList>
          <li>
            <strong>Context strip (pt-context-strip)</strong> — pinned to the
            top: avatar, creator name, campaign chip, post_id chip,
            deliverable label so you always know what you&apos;re submitting.
          </li>
          <li>
            <strong>Verify Strip</strong> — date pill + URL pill + ownership
            tickmark (details below).
          </li>
          <li>
            <strong>Inline alerts</strong> — red alert if the pasted URL
            host isn&apos;t instagram.com; amber warning if the URL is a
            bare <KMCode>/p/</KMCode> shortcode with no username to verify
            against; amber if ads_usage_rights=Yes but partnership_id is
            blank.
          </li>
          <li>
            <strong>Field rows</strong> — Post Link, Post Date,{" "}
            <strong>Download Link (mandatory, red *)</strong>, Raw Footage Dump
            (with a Drive info popover explaining folder structure), Partnership
            Key. The Drive Download Link is now required on{" "}
            <strong>every</strong> post (not just ad posts) — the content asset
            must always be captured.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Posting Overview modal (read-only)">
        <KMList>
          <li>
            Opens when you click the eye icon on a posted row.
          </li>
          <li>
            <strong>Identity card</strong> — avatar, creator name, handle,
            workflow status chip, <strong>Collab ID</strong> chip (groups the
            deliverables of the collaboration), campaign chip, content_type
            pill.
          </li>
          <li>
            <strong>Fields grid</strong> — every field captured at submit
            (post_link, post_date, download_link, raw_dump, partnership_id,
            ads_usage_rights). Links render as &quot;Open&quot; buttons; empty
            slots render <KMCode>NA</KMCode> badges.
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
            = next 15th/30th cycle) — ONE per <KMCode>collab_id</KMCode>, keyed
            on the collab representative (lowest post_id), created ONLY when the
            whole collab is payment-eligible (see Auto-Init Gate).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Auto-Init Gate (autoInitDraftPayment)">
        <p>
          Draft payment rows only spawn when every deliverable sharing the{" "}
          <KMCode>collab_id</KMCode> has both post_link AND post_date, AND no
          deliverable with ads_usage_rights=Yes is missing a partnership_id. The
          single draft is keyed on the collab representative (lowest post_id) and
          carries the full collab amount (sum of the per-row splits). Prevents
          UTR-less ghost rows in Accounts Hub before the collab is actually
          payable.
        </p>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Partnership Key is required to submit whenever ad usage rights are
            granted (any non-empty ads_usage_rights, e.g. &quot;5 Months&quot;)
            and, when present, must be the numeric Meta partnership code (digits
            only). Submit blocks until both hold. Non-ad posts are exempt — no
            Meta code exists for them.
          </li>
          <li>
            Date drift of ±1 day is real (snowflake ≠ publish time). The
            verify tickmark forces a human check.
          </li>
          <li>
            Each deliverable submits independently and keeps its own short
            post_id (<KMCode>SIF-1-P1</KMCode>, <KMCode>SIF-1-P2</KMCode> …).
            They are grouped on the board by their shared{" "}
            <KMCode>collab_id</KMCode> via the Collab ID column — there is no
            parent/child relationship.
          </li>
          <li>
            Re-submit overwrites post_link / post_date / raw_dump /
            download_link / partnership_id. Audit trail preserved via
            updated_at.
          </li>
          <li>
            Red <KMCode>MissingFieldsAlert</KMCode> sits above the submit
            button — lists every required field still empty (Post Date, Post
            Link, Download Link, Partnership Key when ad usage rights granted).
            Uses Zod{" "}
            <KMCode>safeParse(watch())</KMCode> so all blockers surface in a
            single pass.
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
