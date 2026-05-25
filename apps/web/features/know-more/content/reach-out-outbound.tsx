import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function ReachOutOutboundKM() {
  return (
    <>
      <KMHeader
        title="Reach Out · Outbound"
        subtitle="We initiate. Paste an Instagram handle, pick a campaign, fire the collab brief email — all in one submit."
      />

      <KMSection tag="Purpose">
        <p>
          Outbound is the seed step for every Saadaa-initiated collab. The form
          looks up the creator&apos;s IG profile (live or cached), creates
          their <KMCode>creators</KMCode> row if new, spawns the parent post
          for the chosen campaign, and queues the IG profile for the 3-hour
          Apify enrichment cron.
        </p>
      </KMSection>

      <KMSection tag="Fields written">
        <KMList>
          <li>
            <strong>creators</strong> · username, inf_name, instagram_link,
            followers, gender, language, ER, avg_likes (everything the live
            widget surfaces).
          </li>
          <li>
            <strong>posts</strong> · post_id <KMCode>SIF-{"{N}"}-P{"{N}"}</KMCode>{" "}
            (auto), workflow_status <KMCode>Reach Out</KMCode>, campaign_id,
            content_type, commercial_*_rate, reachout_type{" "}
            <KMCode>Outbound</KMCode>.
          </li>
          <li>
            <strong>instagram_cache</strong> · pending row enqueued if no
            cached profile exists — the 3-hr Apify cron picks it up and
            backfills followers / verification / category.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Lookup pipeline">
        <KMList>
          <li>
            <strong>1. creators</strong> — existing row wins (no re-fetch).
          </li>
          <li>
            <strong>2. instagram_cache</strong> — last known scrape (≤ 3 hrs).
          </li>
          <li>
            <strong>3. queue</strong> — upsert <KMCode>pending</KMCode> + show
            yellow chip; cron fills in within 3 hrs.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Campaign + creator + IG link are required. Followers can be blank
            if the cron hasn&apos;t run yet — it&apos;ll backfill later.
          </li>
          <li>
            Commercial rates are per-deliverable-type (Reel / Static / Story).
            Leave at 0 for a pure-barter collab.
          </li>
          <li>
            Logged-by stamps with the signed-in user&apos;s email; appears on
            the post row for audit.
          </li>
          <li>
            Re-submitting the same username + campaign creates a new collab
            episode (different post_id). Same campaign + same creator + new
            content_type is intentional.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Don&apos;t skip the live IG lookup — it confirms the handle exists and
        primes downstream stages with avatar, follower tier, and ER. Submitting
        with a typo creates a stuck row that the cron can never enrich.
      </KMCallout>
    </>
  );
}
