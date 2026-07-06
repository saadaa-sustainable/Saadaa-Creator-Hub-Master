import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function PartnershipStatusKM() {
  return (
    <>
      <KMHeader
        title="Partnership Status"
        subtitle="A live kanban of every creator's Instagram partnership-ad permission — who has been asked, who accepted, who declined. Lives as a tab inside the main Dashboard."
      />

      <KMSection tag="What a partnership is">
        <p>
          To run a creator&apos;s post as a <strong>partnership ad</strong>, the
          creator must approve Saadaa&apos;s branded-content request on
          Instagram. The permission is <strong>per creator</strong> (account
          level), not per post — once accepted, it covers their content until
          revoked. The request is sent <strong>automatically</strong> when a
          posting is submitted: the posting form&apos;s status popup checks the
          creator&apos;s live state and sends the invite if none exists.
        </p>
      </KMSection>

      <KMSection tag="The five lanes">
        <KMList>
          <li>
            <strong>1 · Requested</strong> — invite sent, awaiting the creator.
            The card shows when the request went out.
          </li>
          <li>
            <strong>2 · Rejected</strong> — the creator declined (or revoked a
            previous approval). The card shows the rejection date and a{" "}
            <strong>Resend request</strong> button — resending is always a
            deliberate manual action, never automatic.
          </li>
          <li>
            <strong>3 · Accepted · Not Tested</strong> — the creator approved
            but none of their posts has run as a Meta ad yet. Payments and ad
            usage are unblocked; the creative just hasn&apos;t gone to testing.
          </li>
          <li>
            <strong>4 · Accepted &amp; Tested</strong> — approved AND the
            creator&apos;s content is in the Meta Ads warehouse. The card wears
            the best creative-test category badge (same colors as Ad Status),
            the ads count + total spend, and a <strong>View on Ad Status</strong>{" "}
            deep-link.
          </li>
          <li>
            <strong>5 · Failure on Sending</strong> — the automatic invite (or a
            resend) errored on Instagram&apos;s side and the creator has no
            active request. The card shows the exact error and a{" "}
            <strong>Retry send</strong> button.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Live refresh">
        <p>
          Opening the tab quietly re-checks every <strong>Requested</strong>{" "}
          creator against the live Instagram API (newest first, capped per
          sweep), so accepts and rejects that happened since your last visit
          move lanes immediately — and their timestamps are stamped in the
          database (<KMCode>partnership_approved_at</KMCode> /{" "}
          <KMCode>partnership_declined_at</KMCode>). The{" "}
          <strong>Refresh statuses</strong> button runs the same sweep on
          demand.
        </p>
        <p>
          A <strong>daily background refresh</strong> (server cron, ~9:00 IST)
          also re-reads every creator on the board with nobody watching: all
          pending requests every day, plus the stalest accepted/rejected
          creators (to catch revocations). Worst-case staleness with zero
          clicks is therefore about a day; opening the tab is always the
          freshest read.
        </p>
      </KMSection>

      <KMSection tag="Filters">
        <KMList>
          <li>
            <strong>Search</strong> — debounced free-text over INF ID, name and
            username.
          </li>
          <li>
            <strong>Campaign</strong> — creators with at least one post in the
            selected campaign.
          </li>
          <li>
            <strong>Partnership Status</strong> — the raw permission state
            (Pending / Approved / Rejected / Revoked) across all lanes.
          </li>
          <li>
            <strong>Creative Test Status</strong> — warehouse category (Winner,
            Discarded, …) mapped from the Ad Status view; matches creators with
            at least one post in that category.
          </li>
          <li>
            <strong>Requested from / to</strong> — window on the request date.
          </li>
          <li>
            <strong>Posted from / to</strong> — matches creators with at least
            one stamped post in the date range.
          </li>
          <li>
            <strong>Onboarding from / to</strong> — same, on the onboard date.
          </li>
          <li>
            <strong>Ad ID / Ad Name</strong> — find the creator behind a
            specific warehouse ad (tested creators only).
          </li>
        </KMList>
        <KMCallout tone="info">
          All filters sync to the URL (<KMCode>?tab=partnerships</KMCode> + the
          filter params), so a filtered view is linkable and survives refresh.
        </KMCallout>
      </KMSection>

      <KMSection tag="How it connects">
        <KMList>
          <li>
            The same status appears as a pill on the <strong>Posting</strong>{" "}
            board, the posting form header, the <strong>Journey</strong> cards
            and the <strong>Accounts Hub</strong> ledger — one shared mapping
            everywhere.
          </li>
          <li>
            The state and its dates are also stored on the{" "}
            <strong>creator record</strong> itself — Creator Analytics shows
            the partnership state with its acceptance (or rejection) date in
            every creator&apos;s history modal.
          </li>
          <li>
            <strong>Payments</strong>: a collab with ad-usage rights can only be
            paid once the creator&apos;s partnership is{" "}
            <strong>accepted</strong>. A pending or rejected request blocks the
            Done payment.
          </li>
          <li>
            <strong>Ads</strong>: only accepted creators&apos; posts are valid
            for partnership-ad usage.
          </li>
        </KMList>
      </KMSection>
    </>
  );
}
