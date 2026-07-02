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

      <KMSection tag="The three lanes">
        <KMList>
          <li>
            <strong>Requested</strong> — invite sent, awaiting the creator. The
            card shows when the request went out.
          </li>
          <li>
            <strong>Accepted</strong> — the creator approved. The card shows
            both the request date and the acceptance date. Payments and ad
            usage for this creator are unblocked.
          </li>
          <li>
            <strong>Rejected</strong> — the creator declined (or revoked a
            previous approval). The card shows the rejection date and a{" "}
            <strong>Resend request</strong> button — resending is always a
            deliberate manual action, never automatic.
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
            <strong>Requested from / to</strong> — window on the request date.
          </li>
        </KMList>
        <KMCallout tone="info">
          Filters sync to the URL (<KMCode>?tab=partnerships</KMCode> +{" "}
          <KMCode>q</KMCode> / <KMCode>campaign</KMCode> /{" "}
          <KMCode>sentFrom</KMCode> / <KMCode>sentTo</KMCode>), so a filtered
          view is linkable and survives refresh.
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
