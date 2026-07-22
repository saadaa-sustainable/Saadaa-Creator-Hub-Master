import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function JourneyKM() {
  return (
    <>
      <KMHeader
        title="Influencer Journey"
        subtitle="Read-only pipeline kanban. Every post row across all 5 workflow stages in one scrollable board — filtered by campaign."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — Route icon + title + this Know More button.
          </li>
          <li>
            <strong>2. Filter bar</strong> — Campaign (URL-driven; share the URL to
            hand off a filtered view) plus instant client-side filters: Search,
            Influencer, Team Member, Tier, Order Status, Collab Type, Stage
            (Reach Out / Onboarding / Posted) and a Date range picker whose
            toggle picks which date it applies to — Reached (reach-out date),
            Onboarded (onboard date) or Posted (post date). Rows missing the
            chosen date drop out while a range is active. Hit
            &quot;Clear&quot; to reset.
          </li>
          <li>
            <strong>3. KPI strip</strong> — In Pipeline · Active · Posted · Closed.
            Recomputed live from the filtered card set, so the KPI strip, funnel
            and board always agree — every filter (Team Member, Tier, …) moves all
            three together.
          </li>
          <li>
            <strong>4. Kanban board</strong> — 5 columns left → right (see below).
            Horizontal scroll on all viewports; snap scrolling on mobile.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="The 5 pipeline stages">
        <KMList>
          <li>
            <strong>Reach Out</strong>{" "}
            <KMCode>workflow_status = &quot;Reach Out&quot;</KMCode> — Creator has been
            contacted (outbound or inbound) but not yet onboarded. Date shown: reach-out
            date.
          </li>
          <li>
            <strong>On Board</strong>{" "}
            <KMCode>workflow_status IN (&quot;On Board&quot;, &quot;Order Sent&quot;)</KMCode>{" "}
            — Creator accepted the collab; order placed or about to be. Date shown:
            onboard date.
          </li>
          <li>
            <strong>Posted</strong>{" "}
            <KMCode>workflow_status = &quot;Posted&quot;</KMCode> — Content is live on the
            creator&apos;s profile. Date shown: post date.
          </li>
          <li>
            <strong>Delivered</strong>{" "}
            <KMCode>workflow_status = &quot;Delivered&quot;</KMCode> — Garment delivered
            (or barter fulfilled). Date shown: estimated delivery date.
          </li>
          <li>
            <strong>RTO / Cancelled</strong>{" "}
            <KMCode>
              workflow_status IN (&quot;RTO&quot;, &quot;Cancelled&quot;, &quot;RTO -
              Reverse Picked&quot;, &quot;RTO - Delivered&quot;)
            </KMCode>{" "}
            — All closed/failed statuses grouped into one column to keep the board compact.
            Date shown: the most informative date available (post, delivery, or onboard).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Reading a card">
        <KMList>
          <li>
            <strong>Avatar + name</strong> — Profile picture proxied via weserv.nl to
            bypass Instagram CDN blocks. Click the avatar to open the creator history
            overlay (all collabs for that creator, payment totals, recent posts).
          </li>
          <li>
            <strong>Category + followers</strong> — Pulled from the{" "}
            <KMCode>creators</KMCode> table. Nano &lt; 10K, Micro 10K–50K, Mid-tier
            50K–500K, Macro 500K–1M, Mega &gt; 1M.
          </li>
          <li>
            <strong>Campaign chip</strong> — Campaign ID in amber badge. Filter by
            campaign using the filter bar above.
          </li>
          <li>
            <strong>Key date</strong> — Changes meaning depending on which column the
            card is in (see stage descriptions above).
          </li>
          <li>
            <strong>Stage owner</strong> — Reach Out shows <KMCode>logged_by</KMCode>,
            On Board shows <KMCode>onboarded_by</KMCode>, and Posted shows{" "}
            <KMCode>posted_by</KMCode>, with legacy fallbacks when a stage owner
            is blank.
          </li>
          <li>
            <strong>Order ID + status chip</strong> — Shown only when an order exists.
            Green = Delivered, red = RTO / Cancelled, amber = in transit.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Mobile swipe">
        <p>
          On mobile the board uses <KMCode>overflow-x-auto</KMCode> +{" "}
          <KMCode>snap-x snap-mandatory</KMCode>. Swipe left to advance through
          stages — each column snaps into view cleanly. The column header is sticky
          so the stage label stays visible while you scroll the cards beneath it.
        </p>
      </KMSection>

      <KMSection tag="KPI definitions">
        <KMList>
          <li>
            <strong>In Pipeline</strong> — Total post rows returned by the query (all
            statuses, campaign filter applied).
          </li>
          <li>
            <strong>Active</strong> — Reach Out + On Board + Order Sent. Posts still in
            the pre-content phase.
          </li>
          <li>
            <strong>Posted</strong> — Posted + Delivered. Content is live or fully
            completed.
          </li>
          <li>
            <strong>Closed</strong> — RTO + Cancelled (all RTO sub-statuses included).
            Failed or reversed collabs.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Conversion funnel">
        <p>
          A conversion-rate strip shows how parent collabs flow stage to stage,
          computed cumulatively:
        </p>
        <KMList>
          <li>
            <strong>Reachout → Onboarding</strong> — share of reach-outs that
            reached On Board.
          </li>
          <li>
            <strong>Onboarding → Posting</strong> — share of onboarded collabs
            that went Posted.
          </li>
          <li>
            <strong>Posting → Payment</strong> — share of posted collabs that
            settled payment.
          </li>
          <li>
            <strong>Overall</strong> — end-to-end conversion across the full
            funnel.
          </li>
        </KMList>
        <p>
          Rates are computed over parent collabs (one count per collab, not per
          deliverable).
        </p>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> — One card per post row. Fetches up to 2,000 rows.
            Apply a campaign filter to stay within scope.
          </li>
          <li>
            <strong>creators</strong> — Profile picture, category, followers joined by
            username in a single batch query for O(1) per-card lookup.
          </li>
          <li>
            <strong>campaigns</strong> — Campaign name resolution for the filter
            dropdown.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        The board is read-only — use it for pipeline visibility only. To take action on
        a creator (onboard, submit posting, update order) navigate to the relevant
        workflow stage page.
      </KMCallout>
    </>
  );
}
