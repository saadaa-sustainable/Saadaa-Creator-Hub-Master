import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function ReachOutInboundKM() {
  return (
    <>
      <KMHeader
        title="Reach Out · Inbound"
        subtitle="They came in. Batch-log creators who pitched us. Manual roster (cap 10) or CSV/XLSX import for larger batches."
      />

      <KMSection tag="Page layout">
        <KMList>
          <li>
            <strong>Step 01 — Campaign Assignment</strong> · pick the campaign
            every row in this batch will be tagged to.
          </li>
          <li>
            <strong>Manual Entry Cap card</strong> · live counter shows{" "}
            <KMCode>N / 10</KMCode>. Add row button disables at the cap; switch
            to CSV upload past that.
          </li>
          <li>
            <strong>Step 02 — Inbound Roster</strong> · per-row form with
            Profile URL, Gender, Content Type. (Collab Type + Commercials were
            removed 2026-06-10 — inbound is always Barter / ₹0.)
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Bulk import">
        <KMList>
          <li>
            <strong>XLSX template</strong> · click to download a pre-formatted
            workbook with columns{" "}
            <KMCode>instaLink, gender, contentCode</KMCode> + dropdown enums for
            gender + content type. (Collab Type + Commercials columns removed
            2026-06-10.)
          </li>
          <li>
            <strong>Upload CSV/XLSX</strong> · accepts <KMCode>.csv</KMCode>,{" "}
            <KMCode>.xlsx</KMCode>, <KMCode>.xls</KMCode>. Parsed rows skip the
            10-row manual cap. SheetJS handles both formats client-side.
          </li>
          <li>
            Header row auto-detected; legacy aliases for the rate columns no
            longer accepted (per-deliverable rate columns dropped 2026-05-27).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Per-row fields">
        <KMList>
          <li>
            <strong>Profile URL</strong> · required. Derives the username (any{" "}
            <KMCode>instagram.com/handle</KMCode> shape works).
          </li>
          <li>
            <strong>Gender</strong> · required. Female / Male / Other.
          </li>
          <li>
            <strong>Content Type</strong> · required. Maps to{" "}
            <KMCode>content_type</KMCode> on the post.
          </li>
          <li>
            <strong>Collab Type + Commercials</strong> · removed from inbound
            (2026-06-10). Inbound reach-outs leave <KMCode>collab_type</KMCode>{" "}
            <strong>unset</strong> (null, NOT auto-Barter) and commercial 0 —
            both are decided in <strong>Onboarding</strong>, same as outbound.
            (Leaving it null keeps inbound out of the Barter funnel bucket until
            a collab type is actually chosen.)
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Equal-split rule (handoff to Onboarding)">
        <KMCallout tone="info">
          The commercial figure here is stored as the agreed total on the parent
          post. Once Onboarding expands the collab into per-deliverable rows,
          the total gets divided by the deliverable count so every row (parent +
          children) holds the same per-row split share. The Onboarding form
          locks Collab Type + Commercials read-only on rows that came from
          Inbound to prevent accidental drift.
        </KMCallout>
      </KMSection>

      <KMSection tag="Fields written (submit)">
        <KMList>
          <li>
            <strong>creators</strong> · same columns as Outbound. Existing rows
            update enrichment fields only.
          </li>
          <li>
            <strong>posts</strong> · workflow_status <KMCode>Reach Out</KMCode>,
            reachout_type <KMCode>Inbound</KMCode>, reachout_direction{" "}
            <KMCode>inbound</KMCode>, collab_type, commercial_amount,
            content_type, campaign_id, nomenclature, all per-row fields above.
          </li>
          <li>
            <strong>profile_id</strong> · the legacy IG numeric id from the
            Meta/historic Fetch is stored on each new creator (recognises a
            returning handle later).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Fetch (bulk, Meta batch of 50)">
        <KMList>
          <li>
            <strong>Fetch button</strong> pulls every unresolved row live from
            Instagram via Meta Batch calls (≤50 sub-requests each — the{" "}
            <KMCode>ig_fetching.py</KMCode> model). It{" "}
            <strong>auto-loops</strong> in batches of 50: e.g. 70 rows → fetch
            50, cool down, fetch 20 — no re-click. A live progress chip shows{" "}
            <KMCode>Fetching done/total</KMCode> + the cooldown countdown, with
            a <strong>Stop</strong> button. Each row shows its own spinner →
            Live / Last known / Not fetchable.
          </li>
          <li>
            <strong>Fresh cache (&lt;6h) fetches are free</strong> — handles
            live-fetched in the last 6 hours are served from{" "}
            <KMCode>instagram_cache</KMCode> before the Meta batch, so they
            spend no quota and fill in even during a cooldown. Re-importing a
            sheet you fetched an hour ago costs ~0 Meta calls (Meta counts
            every batch sub-request individually — caching, not batching, is
            what stretches the ~200/hr app budget).
          </li>
          <li>
            <strong>Fetch-before-submit is a validation rule</strong> — a row
            with a profile URL must be fetched (live, cached, or a definitive
            not-fetchable result) before the batch will submit.
          </li>
          <li>
            <strong>Rate gate</strong> — the 50-call window is shared with the
            outbound Fetch, but a filled window pauses only when Meta&apos;s
            own quota gauge is warming: &lt;60% usage → no pause (window just
            resets); 60–75% → 1-minute breather; ≥75% → 5-minute cooldown with
            a retry countdown. <KMCode>lib/meta-rate-limit.ts</KMCode>.
          </li>
          <li>
            <strong>Every fetch is persisted</strong> to{" "}
            <KMCode>instagram_cache</KMCode> (followers / ER / avg likes /
            profile_pic / profile_id / status) — the app&apos;s avatar fallback,
            now Meta-sourced. Only meta/historic hits are written (a transient
            error never overwrites good cached data).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Validation + alerts">
        <KMList>
          <li>
            Per-row errors highlight inline (red border on the cell, helper text
            below).
          </li>
          <li>
            <strong>Live Instagram URL validation</strong> — each Profile URL is
            checked against the shared Instagram-profile regex in{" "}
            <KMCode>lib/validators.ts</KMCode>. An invalid URL flags the row
            live (red border) on type and on blur, not only at submit.
          </li>
          <li>
            <strong>Duplicate-creator guard</strong> — a row for a creator
            already in the same campaign fails on submit, while the other rows
            still commit. A cancelled legacy collab can free the campaign rule,
            but a creator-level blacklist never does.
          </li>
          <li>
            <strong>Offboarded creator guard</strong> — Fetch All marks the row
            red immediately with the recorded reason. Submit All checks again on
            the server, so the blocked creator cannot be re-added through a
            stale batch.
          </li>
          <li>
            Red <KMCode>MissingFieldsAlert</KMCode> renders above the Submit All
            button listing every distinct missing column across the batch
            (Campaign ID, Profile URL, Gender, Content Type, Collab Type,
            Commercials).
          </li>
          <li>
            Submit succeeds per row independently — failed rows stay in the
            roster for fix-and-retry; succeeded rows clear.
          </li>
        </KMList>
      </KMSection>
    </>
  );
}
