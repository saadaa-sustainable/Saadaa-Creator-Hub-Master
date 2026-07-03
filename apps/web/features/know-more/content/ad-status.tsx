import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function AdStatusKM() {
  return (
    <>
      <KMHeader
        title="Ad Status"
        subtitle="Creator posts running as Meta ads. Every ad is matched from the Meta Ads warehouse by the post ID inside its ad name, with spend, ROAS and a performance category per creative."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — Megaphone icon + title + Know More
            button.
          </li>
          <li>
            <strong>2. Filter strip</strong> — search, campaign, classification
            (warehouse categories + legacy results), ad status. URL-driven.
          </li>
          <li>
            <strong>3. KPI strip</strong> — Eligible · Untested · In Meta Ads,
            then the six warehouse categories (Incremental Winners → Discarded).
          </li>
          <li>
            <strong>4. Analytics bento</strong> — category donut + Win Rate /
            Classification Rate / In Meta Ads stats.
          </li>
          <li>
            <strong>5. Untested Ads</strong> — eligible posts not yet found in
            the warehouse. Our pipeline nudge list.
          </li>
          <li>
            <strong>6. Ad Run Status</strong> — one row per post that ran as an
            ad: creative thumbnail, ad name, created date, Spend, ROAS, FTEWV,
            NCP, Shopify orders, category chip, Landing + Preview links. Posts
            with several ads show the <strong>first-occurrence</strong> ad
            (earliest created) inline plus a &quot;+N more ads&quot; expander.
            Clicking anywhere on a row opens its full overview popup; both
            sections paginate at 60 rows per page.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Two data sources — live + historic">
        <KMList>
          <li>
            <strong>Live posts</strong> · every Posted / Delivered post whose
            post ID (e.g. <KMCode>SIF-123-P1</KMCode>) appears inside a
            warehouse ad name is matched automatically.
          </li>
          <li>
            <strong>Historic archive</strong> · warehouse ads referencing a
            post that predates this platform are matched against the historic
            archive instead. These rows carry a neutral{" "}
            <strong>Historic</strong> chip and always sit in Ad Run — by
            definition they ran as ads. Partnership editing is disabled on
            them.
          </li>
          <li>
            <strong>Retired IDs</strong> · some older ad names carry a post ID
            that was retired during the creator-data cleanup (the creator was
            renumbered). These ads are resolved through the legacy archive to
            the creator&apos;s current profile and shown with a{" "}
            <strong>Retired ID</strong> chip — the spend and category are real,
            but no specific post exists behind the row.
          </li>
          <li>
            <strong>Eligibility</strong> · a post is tracked here when its ads
            usage rights are granted OR it is found in the warehouse (whichever
            comes first).
          </li>
          <li>
            <strong>Untested vs Ad Run</strong> · Untested = eligible but not
            yet found in the warehouse and not classified. Ad Run = found in
            the warehouse (or classified). Matching alone moves a post out of
            Untested.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="How ads are classified — four gates">
        <p>
          The analytics team&apos;s warehouse scores every ad against four
          pass/fail gates. The category is computed there and shown here as-is
          — this page never re-scores an ad.
        </p>
        <KMList>
          <li>
            <strong>Gate 1 — Scale</strong> · impressions ≥ 50,000. Mandatory
            for any winner-class category.
          </li>
          <li>
            <strong>Gate 2 — Returns</strong> · ROAS ≥ 3.2.
          </li>
          <li>
            <strong>Gate 3 — New-customer cost</strong> · cost per new customer
            purchase (NCP) above ₹0 and at most ₹525.
          </li>
          <li>
            <strong>Gate 4 — Visitor cost</strong> · cost per first-time
            engaged website visitor (FTEWV) above ₹0 and at most ₹12.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Category matrix (best → worst)">
        <KMList>
          <li>
            <strong>Incremental Winner</strong> · Gate 1 AND (Gate 2 OR Gate 3)
            AND Gate 4 — scaled, profitable and bringing in cheap new visitors.
          </li>
          <li>
            <strong>Winner</strong> · Gate 1 AND (Gate 2 OR Gate 3) — scaled
            with proven returns.
          </li>
          <li>
            <strong>P0 Analysis</strong> · Gate 1 AND Gate 4 — scaled with
            cheap visitors; returns not proven yet.
          </li>
          <li>
            <strong>P1 Analysis</strong> · Gate 1 only — scaled, everything
            else pending.
          </li>
          <li>
            <strong>P2 Analysis</strong> · Gate 2 only — good returns but never
            reached scale.
          </li>
          <li>
            <strong>Discarded</strong> · none of the above combinations.
          </li>
        </KMList>
        <p>
          A post with several ads wears its <strong>first-occurrence</strong>{" "}
          ad&apos;s category — the earliest-created ad is the one we judge the
          creative by — and the same rule feeds the KPI tiles and the donut.
          The overview popup labels that ad (e.g. &quot;First Occurrence Winner
          Ad&quot;), and each ad in the expander keeps its own chip.
        </p>
      </KMSection>

      <KMSection tag="Per-ad metrics">
        <KMList>
          <li>
            <strong>Spend</strong> · total amount spent on the ad (₹).
          </li>
          <li>
            <strong>ROAS</strong> · return on ad spend, moving average, shown
            as &quot;2.35x&quot;.
          </li>
          <li>
            <strong>FTEWV</strong> · first-time engaged website visitors the ad
            brought in.
          </li>
          <li>
            <strong>NCP</strong> · new customer purchases attributed to the ad.
          </li>
          <li>
            <strong>Shop. Orders</strong> · Shopify orders attributed to the
            ad.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Thumbnails, Preview & Landing links">
        <KMList>
          <li>
            <strong>Thumbnail</strong> · the actual ad creative. Clicking it
            (or <strong>Preview</strong>) opens Meta&apos;s real ad preview in
            a new tab. Falls back to the creator avatar when Meta&apos;s image
            link has expired.
          </li>
          <li>
            <strong>Landing</strong> · the page the ad points at (product page
            or Instagram permalink).
          </li>
          <li>
            <strong>Post / Drive</strong> · the organic Instagram post and its
            raw asset, unchanged from before.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="KPI formulas">
        <KMList>
          <li>
            <strong>Eligible</strong> · Posted/Delivered posts with ads usage
            rights or a warehouse match.
          </li>
          <li>
            <strong>Untested</strong> · eligible posts with no warehouse match
            and no classification yet.
          </li>
          <li>
            <strong>In Meta Ads</strong> · live posts found in the warehouse.
          </li>
          <li>
            <strong>Category tiles</strong> · matched posts (live + historic)
            counted once each under their first-occurrence ad&apos;s category.
          </li>
          <li>
            <strong>Win Rate</strong> · Incremental Winners + Winners ÷ all
            categorised posts.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Partnership ID">
        <p>
          Each live ad-eligible post has an inline editable{" "}
          <KMCode>partnership_id</KMCode> — the Meta partnership ad ID used to
          run the creator&apos;s post as a paid ad. Save inline; no full form
          needed. Historic rows are read-only.
        </p>
      </KMSection>

      <KMCallout tone="info">
        Categories, thresholds and metrics are owned by the analytics
        team&apos;s Meta Ads warehouse and refresh with its sync. If the
        warehouse is briefly unreachable, the page still renders — warehouse
        columns simply show as untested/uncategorised until the next load.
      </KMCallout>
    </>
  );
}
