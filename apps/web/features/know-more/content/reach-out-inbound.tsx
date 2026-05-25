import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function ReachOutInboundKM() {
  return (
    <>
      <KMHeader
        title="Reach Out · Inbound"
        subtitle="They came in. Log a creator who pitched us — same downstream pipeline as Outbound, different attribution."
      />

      <KMSection tag="Purpose">
        <p>
          Inbound captures collabs where the creator initiated contact (DM,
          email, form). Operationally identical to Outbound but tagged{" "}
          <KMCode>reachout_type = Inbound</KMCode> so dashboards can split
          self-served from agent-sourced creators.
        </p>
      </KMSection>

      <KMSection tag="Fields written">
        <KMList>
          <li>
            <strong>creators</strong> · same columns as Outbound. If the
            creator already exists, only enrichment fields update.
          </li>
          <li>
            <strong>posts</strong> · workflow_status <KMCode>Reach Out</KMCode>,{" "}
            reachout_type <KMCode>Inbound</KMCode>, reachout_direction{" "}
            <KMCode>inbound</KMCode>, post_id <KMCode>SIF-{"{N}"}-P{"{N}"}</KMCode>.
          </li>
          <li>
            <strong>inbound_reachout_queue</strong> view · every inbound row
            shows up here for triage. Once you push it through, it flows into
            the standard Onboarding kanban.
          </li>
          <li>
            <strong>instagram_cache</strong> · pending row enqueued for the
            3-hr Apify cron just like Outbound.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Triage rule">
        <p>
          The inbound queue is sorted oldest-first by{" "}
          <KMCode>reach_out_date</KMCode>. Pick up anything &gt; 48 hours old
          before fresh entries — slow response on inbound kills conversion.
        </p>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            If a creator pings us about a campaign we&apos;re already running
            an outbound collab on, log it as a new inbound row anyway — the
            collab_number distinguishes episodes.
          </li>
          <li>
            Inbound creators often arrive with no commercial expectations.
            Leave rates at 0 and re-negotiate at onboarding time.
          </li>
          <li>
            The dashboard funnel separates inbound vs outbound conversion at
            every stage so you can measure source quality.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Inbound + Outbound share the <KMCode>submit_reachout</KMCode> RPC;
        only the <KMCode>p_reachout_direction</KMCode> arg differs.
      </KMCallout>
    </>
  );
}
