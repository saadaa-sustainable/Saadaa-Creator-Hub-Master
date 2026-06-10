import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function ReachOutOutboundKM() {
  return (
    <>
      <KMHeader
        title="Reach Out · Outbound"
        subtitle="We initiate. Live IG lookup + profile preview + one-click submit creates the collab and queues enrichment."
      />

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>Left column</strong> — campaign selector + IG handle input
            with live lookup button.
          </li>
          <li>
            <strong>Right column</strong> — Instagram profile preview card
            (avatar, follower tier, ER, verification badge) fed by the lookup.
          </li>
          <li>
            Form auto-fills creator name, gender, followers, language from
            the cache hit; you can override any field before submit.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Lookup pipeline (lookupCreator action)">
        <KMList>
          <li>
            <strong>1. creators</strong> — existing row wins (no re-fetch,
            keeps audit history intact).
          </li>
          <li>
            <strong>2. instagram_cache</strong> — last Apify scrape (≤ 3 hrs
            old). Returns followers + verification + profile_pic + ER.
          </li>
          <li>
            <strong>3. queue</strong> — upserts a{" "}
            <KMCode>status=pending</KMCode> row; the 3-hr Apify cron fills it
            on the next tick. Preview shows a yellow &quot;Queued&quot; chip.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Fields written (submit)">
        <KMList>
          <li>
            <strong>creators</strong> · username, inf_name, instagram_link,
            followers, gender, language, ER, avg_likes, verification.
          </li>
          <li>
            <strong>posts</strong> · post_id <KMCode>SIF-{"{N}"}-P{"{N}"}</KMCode>{" "}
            (auto via submit_reachout RPC), workflow_status{" "}
            <KMCode>Reach Out</KMCode>, campaign_id, content_type, reachout_type{" "}
            <KMCode>Outbound</KMCode>, reachout_direction{" "}
            <KMCode>outbound</KMCode>. Commercial agreed amount + collab_type
            are captured in onboarding (or inbound roster).
          </li>
          <li>
            <strong>instagram_cache</strong> · pending row upserted on every
            submit (idempotent, never demotes an already-scraped row).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            Campaign + IG link + Full Name + Content Type are required.
            Followers can be blank if the cron hasn&apos;t enriched yet.
          </li>
          <li>
            Commercial figures captured downstream during Onboarding (or
            already on the post when it came from Inbound). The per-type rate
            columns (reel/post/story) were retired 2026-05-27 — a single
            agreed total now equal-splits across deliverables.
          </li>
          <li>
            Re-submitting same username + campaign creates a new collab
            episode (different post_id, shared inf_id).
          </li>
          <li>
            <KMCode>onboarded_by</KMCode> stamps with the signed-in user
            email for audit.
          </li>
          <li>
            <strong>Instagram URL validation</strong> — the IG link is checked
            against the shared Instagram-profile regex in{" "}
            <KMCode>lib/validators.ts</KMCode>. A malformed link is rejected
            before submit.
          </li>
          <li>
            <strong>Duplicate-creator guard</strong> — submitting a creator
            already in the same campaign is blocked with a field error on the
            Instagram URL, unless the prior collab was{" "}
            <KMCode>Cancelled</KMCode> or <KMCode>Offboarded</KMCode> (voided) —
            either frees the handle to be reached out again for the campaign.
          </li>
          <li>
            <strong>Creator cap</strong> — a campaign accepts at most its
            allocated creator count (the sum of <KMCode>num_influencers</KMCode>{" "}
            across its budget tiers). Once full, new reach-outs are blocked with
            a <KMCode>X/Y</KMCode> message. A Campaign Owner / Global Admin
            raises the allocation (which also raises the budget) to add more.
            Cancelled <strong>and voided (Offboarded)</strong> collabs free a
            slot.
          </li>
          <li>
            Red <KMCode>MissingFieldsAlert</KMCode> renders above the submit
            button listing every empty required field at once (Zod{" "}
            <KMCode>safeParse(watch())</KMCode>), so the operator fixes all
            blockers in one pass.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="warning">
        Don&apos;t skip the live IG lookup — confirms the handle exists and
        primes downstream avatars / tier badges. Typo submits create stuck
        rows the cron can never enrich.
      </KMCallout>
    </>
  );
}
