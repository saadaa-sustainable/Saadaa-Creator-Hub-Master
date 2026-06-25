import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function ReachOutOutboundKM() {
  return (
    <>
      <KMHeader
        title="Reach Out · Outbound"
        subtitle="We initiate. Live IG lookup + profile preview + one-click submit logs the reach-out (the collab is minted later, at onboarding)."
      />

      <KMSection tag="Historic Creator picker">
        <KMList>
          <li>
            A <strong>Historic Creator</strong> button (top of the form, both
            Outbound + Inbound) opens a modal to browse the full creator
            registry. Filters: <strong>Search</strong> (handle/name/SIF),{" "}
            <strong>Content type</strong>, <strong>Category tier</strong>,{" "}
            <strong>Campaign</strong>, <strong>Team member</strong>. Each row =
            avatar + name + <KMCode>@handle · tier</KMCode> + a{" "}
            <strong>Historic</strong>/<strong>New</strong> chip + follower count
            (same row UI as the Dashboard Top Creators).
          </li>
          <li>
            Backed by the <KMCode>list_historic_creators</KMCode> RPC — filters
            span creators-level (search/tier) + collab-level (content/campaign/
            team) joined on <KMCode>inf_id = sif_id</KMCode> across posts +
            cleaned_data. Paginated 60/page by followers desc.
          </li>
          <li>
            <strong>Collab history per row</strong> · each creator shows their
            past collaborations — <KMCode>↻ {"{N}"} collab(s) · C1, C2 · next C
            {"{n}"}</KMCode> for a repeat collaborator,{" "}
            <KMCode>Reached out before · next C2</KMCode> for a historic creator
            we only ever reached out to, or <KMCode>First collab</KMCode> for a
            brand-new one. Sourced from the <KMCode>prior_collab_summary</KMCode>{" "}
            RPC, so the predicted next C matches exactly what onboarding mints.
          </li>
          <li>
            <strong>Onboard button</strong> · each row has an{" "}
            <KMCode>Onboard</KMCode> pill that opens the onboarding form{" "}
            pre-locked to that creator (repeat-collab mode). Fill campaign +
            order + deliverables and submit — it mints the creator&apos;s next
            collab (continuing their C/P over posts ∪ historic_posts). Lets the
            team re-onboard a past creator straight from the browser.
          </li>
        </KMList>
      </KMSection>

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

      <KMSection tag="Lookup pipeline (lookupCreator action) — INSTANT via Meta">
        <KMList>
          <li>
            <strong>1. creators</strong> — existing row wins (no re-fetch). Also
            caught by legacy <KMCode>profile_id</KMCode> even if the handle
            changed → submit blocked, guided to Onboarding for a repeat collab.
          </li>
          <li>
            <strong>2. Meta business_discovery</strong> — LIVE fetch on the
            Fetch click (no Apify, no wait, no cost). Returns followers, profile
            pic, avg likes, ER, and the legacy numeric{" "}
            <KMCode>profile_id</KMCode> (Meta <KMCode>ig_id</KMCode>). Badge:
            &quot;Live&quot;.
          </li>
          <li>
            <strong>3. historic</strong> — Meta missed but the handle is in{" "}
            <KMCode>ig_data_historic</KMCode> → cached metrics. Badge: &quot;Last
            known&quot;.
          </li>
          <li>
            <strong>4. deactivated / error</strong> — Meta &quot;Cannot find
            User&quot; (personal/dead) + no archive ⇒ <strong>deactivated</strong>{" "}
            (manual entry still allowed); a transient Meta failure ⇒{" "}
            <strong>error</strong> (retry). Badge: &quot;Not fetchable&quot; /
            &quot;Fetch failed&quot;.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rate gate (batch of 50 + cooldown)">
        <KMCallout tone="info">
          Each outbound Fetch is <strong>1 call drawn from a rolling window of
          50</strong> (shared with the inbound batch Fetch). After 50 calls — or
          when Meta&apos;s X-App-Usage crosses 75% — the server opens a{" "}
          <strong>cooldown</strong> and further fetches are paused with a retry
          countdown. State lives in{" "}
          <KMCode>app_settings.meta_fetch_window</KMCode>; logic in{" "}
          <KMCode>lib/meta-rate-limit.ts</KMCode> (mirrors{" "}
          <KMCode>ig_fetching.py</KMCode>). The token is READ-ONLY — we never
          write to Meta.
        </KMCallout>
      </KMSection>

      <KMSection tag="Fields written (submit)">
        <KMList>
          <li>
            <strong>creators</strong> · username, inf_name, instagram_link,
            followers, gender, language, ER, avg_likes, verification.
          </li>
          <li>
            <strong>posts</strong> · submit_reachout RPC inserts the row (returns
            its bigserial <KMCode>id</KMCode>), workflow_status{" "}
            <KMCode>Reach Out</KMCode>, campaign_id, content_type, reachout_type{" "}
            <KMCode>Outbound</KMCode>, reachout_direction{" "}
            <KMCode>outbound</KMCode>. Commercial agreed amount + collab_type
            are captured in onboarding (or inbound roster).{" "}
            <strong>Nothing is minted at reach-out</strong> —{" "}
            <KMCode>post_id</KMCode> (P), <KMCode>post_number</KMCode>,{" "}
            <KMCode>collab_id</KMCode> / <KMCode>collab_number</KMCode> all stay
            NULL until onboarding (the row is identified by its bigserial id).
            Onboarding mints the P-block + collab in one go (a collab = one
            order); ghosted reach-outs keep NULL ids forever.
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
            Re-submitting same username + campaign creates a new deliverable
            post <KMCode>P{"{n}"}</KMCode> (shared inf_id) — NOT a collab. The
            collab (<KMCode>C{"{n}"}</KMCode>) is minted later at onboarding,
            keyed to the order.
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
            <strong>Reach-out is unlimited; the cap is an ONBOARDING cap</strong>{" "}
            (2026-06-10) — a campaign can collect any number of reach-outs. The
            allocated creator count (Σ <KMCode>num_influencers</KMCode>) is
            enforced at <strong>onboarding</strong> instead (see the Onboarding
            view). The campaign pill shows <KMCode>onboarded / cap</KMCode> for
            reference; reaching the cap does NOT block reach-out. Un-onboarded
            leftovers are voided (→ Cancelled) when the campaign closes.
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
