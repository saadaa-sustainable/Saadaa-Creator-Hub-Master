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
            Profile URL, Gender, Content Code, and Reel / Post / Story rates.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Bulk import">
        <KMList>
          <li>
            <strong>XLSX template</strong> · click to download a pre-formatted
            workbook with all required columns + dropdown enums.
          </li>
          <li>
            <strong>Upload CSV/XLSX</strong> · accepts <KMCode>.csv</KMCode>,{" "}
            <KMCode>.xlsx</KMCode>, <KMCode>.xls</KMCode>. Parsed rows skip
            the 10-row manual cap. SheetJS handles both formats client-side.
          </li>
          <li>
            Each parsed row runs the same per-row validation (gender, content
            code, at least one positive rate).
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
            <strong>Gender</strong> · required. Female / Male / Other / Unknown.
          </li>
          <li>
            <strong>Content Code</strong> · required. Maps to{" "}
            <KMCode>content_type</KMCode> on the post.
          </li>
          <li>
            <strong>Reel ₹ / Post ₹ / Story ₹</strong> · at least one must
            be &gt; 0. Stored on the post commercial rate columns.
          </li>
        </KMList>
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
            <KMCode>inbound</KMCode>, all per-row fields above.
          </li>
          <li>
            <strong>instagram_cache</strong> · pending row enqueued per row
            for the 3-hr Apify cron (idempotent upsert).
          </li>
          <li>
            <strong>inbound_reachout_queue</strong> view · every inbound row
            surfaces here for triage; sorted oldest-first by reach_out_date.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Triage rule">
        <p>
          The inbound queue is sorted oldest-first. Pick up anything &gt; 48
          hours old before fresh entries — slow response on inbound kills
          conversion.
        </p>
      </KMSection>

      <KMCallout tone="info">
        Inbound + Outbound share the <KMCode>submit_reachout</KMCode> RPC;
        only the <KMCode>p_reachout_direction</KMCode> argument differs.
      </KMCallout>
    </>
  );
}
