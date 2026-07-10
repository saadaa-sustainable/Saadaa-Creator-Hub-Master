import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function PostingKM() {
  return (
    <>
      <KMHeader
        title="Posting"
        subtitle="Log live IG content per deliverable. Live Instagram post fetch (real date + in-app preview), ownership verification, automatic partnership invite, raw-footage drop."
      />

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>Submission toggle</strong> — a two-state segment at the top
            of the filter bar. <KMCode>Not Submitted</KMCode> (the default on
            load) shows the posting work queue (workflow_status{" "}
            <KMCode>On Board / Order Sent</KMCode> — form not yet filled);{" "}
            <KMCode>Submitted</KMCode> shows posted rows (
            <KMCode>Posted</KMCode>). The Stage dropdown still narrows within
            the chosen side.
          </li>
          <li>
            <strong>Filter bar</strong> — <strong>search</strong> (id / name /
            username / IG URL / post link, debounced) · campaign · tier · ads
            rights · <strong>Onboarded by</strong> (the team member who
            onboarded the collab, from <KMCode>onboarded_by</KMCode>) ·{" "}
            <strong>Content Type</strong> · onboarded from/to dates. Selecting
            an <strong>Onboarded by</strong> member also scopes the KPI strip
            below the filters to that member&apos;s metrics.
          </li>
          <li>
            <strong>List / Cards toggle</strong> — both surfaces share the same
            filter strip + per-row action.
          </li>
          <li>
            <strong>Per-row action</strong> — <KMCode>Submit</KMCode> button on
            unposted rows (opens Submit Posting modal); switches to{" "}
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
            <strong>Posts Due</strong> — post IDs yet to be submitted (
            <KMCode>On Board</KMCode> / <KMCode>Order Sent</KMCode>).
          </li>
          <li>
            <strong>Submitted</strong> — post IDs already posted (
            <KMCode>Posted</KMCode>).
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
            top: avatar, creator name, campaign chip, post_id chip, deliverable
            label so you always know what you&apos;re submitting.
          </li>
          <li>
            <strong>Verify Strip</strong> — date pill + URL pill + ownership
            tickmark (details below).
          </li>
          <li>
            <strong>Inline alerts</strong> — red alert if the pasted URL host
            isn&apos;t instagram.com; amber warning if the URL is a bare{" "}
            <KMCode>/p/</KMCode> shortcode with no username to verify against.
          </li>
          <li>
            <strong>Field rows</strong> — Post Link, Post Date,{" "}
            <strong>Download Link (mandatory, red *)</strong>, Raw Footage Dump
            (with a portalled, collision-safe Drive info popover explaining
            folder structure). It stays inside the viewport and no longer
            overlaps the modal header or fields. The Drive Download Link is now
            required on <strong>every</strong> post (not just ad posts) — the
            content asset must always be captured. There is no Partnership Key
            input anymore — the partnership request is sent automatically after
            submit (see Partnership popup below), and the creator&apos;s live
            status shows as a pill in the modal header.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Posting Overview modal (read-only)">
        <KMList>
          <li>Opens when you click the eye icon on a posted row.</li>
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
            <strong>Live Instagram fetch</strong> — on link entry we look the
            post up in <em>this creator&apos;s</em> Instagram media (Meta{" "}
            <KMCode>business_discovery</KMCode>, matched by shortcode). A match
            fills the <strong>authoritative</strong> publish date (no{" "}
            <KMCode>±1d</KMCode>), shows a{" "}
            <KMCode>Verified on Instagram</KMCode> pill, and auto-clears the
            manual ticks — because being in the creator&apos;s own media{" "}
            <em>proves</em> the post is theirs.
          </li>
          <li>
            <strong>View Post</strong> — opens the native Instagram embed in a
            popup (videos play inline, carousels swipe) with the fetched stats
            (likes, comments, caption, media type, date).
          </li>
          <li>
            <strong>Post Date pill (fallback)</strong> — when Meta can&apos;t
            reach the post (personal account / older than the recent window /
            fetch cooling down) the date falls back to the shortcode decode
            <KMCode>(id &gt;&gt; 23) + 1314220021721</KMCode> with the{" "}
            <KMCode>±1d</KMCode> note + the manual date tickmark.
          </li>
          <li>
            <strong>URL pill</strong> — parses the username from the pasted
            link. Same handle as the creator = green ok pill. Handle mismatch =
            blocked outright.
          </li>
          <li>
            <strong>Ownership tickmark</strong> — fallback for bare{" "}
            <KMCode>/p/</KMCode> URLs Meta couldn&apos;t confirm. Operator must
            check &quot;I confirm this is the creator&apos;s post.&quot;
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Fields written">
        <KMList>
          <li>
            <strong>posts</strong> · workflow_status <KMCode>Posted</KMCode>,
            post_link, post_date, download_link (raw IG download URL), raw_dump
            (Drive footage folder). The partnership columns (partnership_status,
            partnership_id, partnership_sent_at / approved_at / declined_at,
            ad_partnership_valid) are stamped by the automatic partnership sync,
            not by the form.
          </li>
          <li>
            <strong>payments</strong> · auto-init draft row (status{" "}
            <KMCode>Not Due</KMCode>, due_date = post_date + 30, est_payable =
            next 15th/30th cycle) — ONE per <KMCode>collab_id</KMCode>, keyed on
            the collab representative (lowest post_id), created ONLY when the
            whole collab is payment-eligible (see Auto-Init Gate).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Partnership popup (after submit)">
        <KMList>
          <li>
            Right after a successful submit, a <strong>blocking popup</strong>{" "}
            checks the creator&apos;s live partnership-ad permission on
            Instagram. It cannot be dismissed mid-flight — the OK button appears
            only once the final status is known.
          </li>
          <li>
            <strong>No request yet</strong> → the invite is sent automatically
            (progress bar). <strong>Already approved</strong> → &quot;Partner
            already exists&quot;. <strong>Already pending</strong> → invite
            previously sent, still awaiting the creator.
          </li>
          <li>
            <strong>Rejected / revoked</strong> → shown with a{" "}
            <strong>Resend request</strong> button. Resending is always manual —
            a creator who declined is never re-invited automatically.
          </li>
          <li>
            The same status appears everywhere: posting board pill, Journey
            cards, Accounts Hub ledger, Creator Analytics and the Dashboard{" "}
            <strong>Partnership Status</strong> kanban tab.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Auto-Init Gate (autoInitDraftPayment)">
        <p>
          Draft payment rows only spawn when every deliverable sharing the{" "}
          <KMCode>collab_id</KMCode> has both post_link AND post_date, AND every
          deliverable with ads_usage_rights=Yes has the partnership{" "}
          <strong>approved</strong> by the creator (or an explicit admin
          override). The single draft is keyed on the collab representative
          (lowest post_id) and carries the full collab amount (sum of the
          per-row splits). Prevents UTR-less ghost rows in Accounts Hub before
          the collab is actually payable.
        </p>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            The inline Partnership Key edit on the board is the{" "}
            <strong>admin override</strong>: entering a numeric Meta code marks
            the partnership as valid even when the API status isn&apos;t
            approved (escape hatch for API gaps). Clearing it withdraws the
            override.
          </li>
          <li>
            Date drift of ±1 day is real (snowflake ≠ publish time). The verify
            tickmark forces a human check.
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
            download_link. Audit trail preserved via updated_at.
          </li>
          <li>
            Red <KMCode>MissingFieldsAlert</KMCode> sits above the submit button
            — lists every required field still empty (Post Date, Post Link,
            Download Link). Uses Zod <KMCode>safeParse(watch())</KMCode> so all
            blockers surface in a single pass.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        The 3-hr Apify cron also runs <KMCode>backfillPostDates</KMCode> over
        any Posted rows that slipped through with NULL post_date, decoding from
        the shortcode automatically.
      </KMCallout>
    </>
  );
}
