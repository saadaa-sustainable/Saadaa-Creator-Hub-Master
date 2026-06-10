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
            <KMCode>N / 10</KMCode>. Add row button disables at the cap;
            switch to CSV upload past that.
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
            <KMCode>instaLink, gender, contentCode</KMCode>{" "}
            + dropdown enums for gender + content type. (Collab Type +
            Commercials columns removed 2026-06-10.)
          </li>
          <li>
            <strong>Upload CSV/XLSX</strong> · accepts <KMCode>.csv</KMCode>,{" "}
            <KMCode>.xlsx</KMCode>, <KMCode>.xls</KMCode>. Parsed rows skip
            the 10-row manual cap. SheetJS handles both formats client-side.
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
            <strong>Profile URL</strong> · required. Derives the username
            (any <KMCode>instagram.com/handle</KMCode> shape works).
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
            (2026-06-10). Every inbound reach-out is recorded as{" "}
            <KMCode>Barter</KMCode> with ₹0 (defaulted on submit; the post still
            carries a <KMCode>collab_type</KMCode> for the RPC). Set commercials
            later in Onboarding if a paid arrangement is agreed.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Equal-split rule (handoff to Onboarding)">
        <KMCallout tone="info">
          The commercial figure here is stored as the agreed total on the
          parent post. Once Onboarding expands the collab into per-deliverable
          rows, the total gets divided by the deliverable count so every row
          (parent + children) holds the same per-row split share. The Onboarding
          form locks Collab Type + Commercials read-only on rows that came from
          Inbound to prevent accidental drift.
        </KMCallout>
      </KMSection>

      <KMSection tag="Fields written (submit)">
        <KMList>
          <li>
            <strong>creators</strong> · same columns as Outbound. Existing
            rows update enrichment fields only.
          </li>
          <li>
            <strong>posts</strong> · workflow_status <KMCode>Reach Out</KMCode>,
            reachout_type <KMCode>Inbound</KMCode>, reachout_direction{" "}
            <KMCode>inbound</KMCode>, collab_type, commercial_amount,
            content_type, campaign_id, nomenclature, all per-row fields above.
          </li>
          <li>
            <strong>instagram_cache</strong> · pending row enqueued per row
            for the 3-hr Apify cron (idempotent upsert).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Validation + alerts">
        <KMList>
          <li>
            Per-row errors highlight inline (red border on the cell, helper
            text below).
          </li>
          <li>
            <strong>Live Instagram URL validation</strong> — each Profile URL
            is checked against the shared Instagram-profile regex in{" "}
            <KMCode>lib/validators.ts</KMCode>. An invalid URL flags the row
            live (red border) on type and on blur, not only at submit.
          </li>
          <li>
            <strong>Duplicate-creator guard</strong> — a row for a creator
            already in the same campaign fails on submit, while the other rows
            still commit. The block lifts if the prior collab was{" "}
            <KMCode>Cancelled</KMCode> or <KMCode>Offboarded</KMCode> (voided).
          </li>
          <li>
            Red <KMCode>MissingFieldsAlert</KMCode> renders above the Submit
            All button listing every distinct missing column across the batch
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
