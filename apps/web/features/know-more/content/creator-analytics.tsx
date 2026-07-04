import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function CreatorAnalyticsKM() {
  return (
    <>
      <KMHeader
        title="Creator Analytics"
        subtitle="A roster directory of every creator with their merged live + historic collaboration history. Lives as a tab inside the main Dashboard."
      />

      <KMSection tag="The roster">
        <p>
          Every row is one creator from the <KMCode>creators</KMCode> table.
          Each carries a shared <strong>avatar</strong> + name / @username, their{" "}
          <KMCode>inf_id</KMCode>, tier badge, follower count and a quick read on
          their collaboration history. The roster is the union of the whole
          creator base — historic and new alike.
        </p>
      </KMSection>

      <KMSection tag="Filters">
        <KMList>
          <li>
            <strong>Search</strong> — debounced free-text over INF ID, name and
            username.
          </li>
          <li>
            <strong>Tier</strong> (<KMCode>creators.category</KMCode>) ·{" "}
            <strong>Region</strong> (<KMCode>creators.state</KMCode>) ·{" "}
            <strong>Creator Type</strong> (Historic / New) ·{" "}
            <strong>Current Stage</strong> (the workflow stage of the creator&apos;s
            most-recent live post).
          </li>
          <li>
            <strong>Reach-out from / to</strong> — matches creators whose
            reach-out window overlaps the range. <strong>Posted from / to</strong>{" "}
            — matches on the creator&apos;s most-recent post date.
          </li>
          <li>
            <strong>Meta Ads</strong> — ads-derived filter: <em>In Meta Ads</em>{" "}
            (≥1 warehouse-matched ad), <em>Winner creators</em> (≥1 post whose
            first-occurrence ad is Winner / Incremental Winner) and{" "}
            <em>Winners · no live collab</em> — proven winners not currently
            working with us, the re-engagement shortlist. The KPI tiles above
            the roster set the same filter on click (click again to clear).
          </li>
        </KMList>
        <KMCallout tone="info">
          Filters sync to the URL (<KMCode>?tab=creators</KMCode> +{" "}
          <KMCode>tier</KMCode> / <KMCode>region</KMCode> / …), so a filtered view
          is linkable and survives refresh.
        </KMCallout>
      </KMSection>

      <KMSection tag="List + cards">
        <KMList>
          <li>
            <strong>List</strong> — a dense table of creator rows. <strong>Cards</strong>{" "}
            — a grid of creator cards. Toggle with the view switch;{" "}
            <strong>phones (≤768px) are forced to cards</strong>.
          </li>
          <li>
            Each row / card shows a <strong>Historic vs New</strong> chip (from{" "}
            <KMCode>creator_type</KMCode>), the <strong>current stage</strong> pill,
            tier, followers, total collabs rendered as{" "}
            <KMCode>5 (2 live · 3 historic)</KMCode>, deliverable count and the
            last post date.
          </li>
          <li>
            <strong>Ads at a glance</strong> — creators who ran as Meta ads
            carry their <strong>best warehouse category badge</strong> (Incr.
            Winner → Discarded, same colors as the Ad Status board) in the chip
            line, plus a <strong>Meta Ads</strong> stat like{" "}
            <KMCode>3 in ads · ₹75.1K</KMCode> (post tokens · total spend
            across all their ad creatives). Ad-less creators show &ldquo;—&rdquo;.
          </li>
        </KMList>
        <KMCallout tone="info">
          The roster is <strong>server-paginated, 60 creators per page</strong>.
          The page lives in <KMCode>?cpage</KMCode>; Prev / Next at the bottom
          (mirroring the Historic Creators picker — <KMCode>X–Y of Z</KMCode>)
          re-fetch the next 60 server-side. Only one page ever reaches the
          browser, so the whole 7,800-creator base never loads at once. Changing
          any filter resets you to page 1.
        </KMCallout>
      </KMSection>

      <KMSection tag="Stage + Historic / New labels">
        <KMList>
          <li>
            <strong>Current Stage</strong> is the <KMCode>workflow_status</KMCode>{" "}
            of the creator&apos;s most-recent <strong>live</strong> post (by post →
            onboard → reach-out date). A creator with no live post shows no stage.
          </li>
          <li>
            <strong>Historic vs New</strong> comes straight from{" "}
            <KMCode>creators.creator_type</KMCode> —{" "}
            <KMCode>historic_creator</KMCode> reads &ldquo;Historic&rdquo;,{" "}
            <KMCode>new_creator</KMCode> reads &ldquo;New&rdquo;.
          </li>
          <li>
            <strong>Deactivated</strong> badge — shown on the card + row (and
            every other creator surface) when{" "}
            <KMCode>creators.is_active = false</KMCode>: a dead/mangled IG handle
            (no <KMCode>profile_id</KMCode>) or a Meta &ldquo;Invalid user
            id&rdquo;. The creator&apos;s history is kept; the badge just flags it
            as unusable.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Per-creator history (live + historic merge)">
        <KMList>
          <li>
            Clicking a creator opens a <strong>collab-history modal</strong>{" "}
            that <strong>loads on demand</strong> — a brief spinner, then every
            collaboration from <KMCode>posts</KMCode> ∪{" "}
            <KMCode>historic_posts</KMCode> (via the{" "}
            <KMCode>creator_collab_history</KMCode> RPC), ordered newest first.
            Each line shows the collab id, content type, post date, payment
            status, a <strong>Live / Historic</strong> source badge and a
            post-link button when an IG URL is present. The header stats (total
            collabs, deliverables, dates, collab-type tally) come from the row
            already in hand, so they show instantly.
          </li>
          <li>
            Counts are <strong>distinct collabs</strong> — deliverable rows of one
            collab fold into a single collab_id (legacy rows coalesce to{" "}
            <KMCode>inf_id-C{"{n}"}</KMCode>). The total splits into live +
            historic so a repeat collaborator is obvious at a glance.
          </li>
          <li>
            <strong>Meta Ads Performance section</strong> — when any of the
            creator&apos;s posts ran as Meta ads (matched in the Meta Ads
            warehouse mirror, including ads under a{" "}
            <strong>retired pre-renumbering ID</strong>), the modal renders one
            block per post token — post ID, first-occurrence category badge,
            Retired ID marker where applicable, and an <strong>Ad Status</strong>{" "}
            deep-link — over the <strong>same per-ad creative cards as the Ad
            Status board&apos;s overview</strong>: thumbnail (opens the Ad
            Preview popup), ad name, Spend / ROAS / Impressions / Orders,
            per-ad category badge and Landing + Preview links. The header
            totals spend across ALL the creator&apos;s ad creatives. Hidden
            for creators with no ads.
          </li>
        </KMList>
        <KMCallout tone="warning">
          Deliverable counts come from <strong>live posts only</strong> (reels +
          static + stories) — the legacy archive never stored a structured
          deliverable split, so historic collabs contribute to the collab count
          but add 0 deliverables.
        </KMCallout>
      </KMSection>
    </>
  );
}
