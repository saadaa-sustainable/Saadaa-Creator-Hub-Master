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
