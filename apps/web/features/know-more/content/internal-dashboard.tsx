import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function InternalDashboardKM() {
  return (
    <>
      <KMHeader
        title="Internal Dashboard"
        subtitle="Team attribution matrix. Onboarding, posting, and reach-out counts per team member × month × campaign for performance reviews."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — Gauge icon + title + Know More button.
          </li>
          <li>
            <strong>2. Filter strip</strong> — month, campaign, team member. URL-driven.
          </li>
          <li>
            <strong>3. Summary KPI strip</strong> — Total Team ROs · Total Onboards ·
            Total Posts This Month.
          </li>
          <li>
            <strong>4. Attribution matrix</strong> — rows = team members, cols = metrics
            (RO count · Onboard count · Post count · Delivery rate · Avg TAT).
          </li>
          <li>
            <strong>5. Member detail panel</strong> — click a row for per-campaign
            breakdown for that member.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Attribution logic">
        <p>
          Each post is attributed to the team member stored in{" "}
          <KMCode>posts.onboarded_by</KMCode> (set when the operator submits
          the onboarding form). Reach Out-only rows that have not yet been
          onboarded surface as &quot;Unassigned&quot; — there is no separate
          reach-out attribution column on prod today.
        </p>
      </KMSection>

      <KMSection tag="Metric formulas">
        <KMList>
          <li>
            <strong>RO Count</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where reach_out_date in period
            AND onboarded_by = this member.
          </li>
          <li>
            <strong>Onboard Count</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where onboard_date in period AND
            onboarded_by = this member.
          </li>
          <li>
            <strong>Post Count</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where post_date in period AND
            onboarded_by = this member.
          </li>
          <li>
            <strong>Delivery Rate</strong> ·{" "}
            <KMCode>Delivered / (Posted + Delivered) × 100</KMCode> for this
            member&apos;s posts.
          </li>
          <li>
            <strong>Avg TAT</strong> · median{" "}
            <KMCode>post_date − reach_out_date</KMCode> days across this
            member&apos;s posts in the period.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Member detail panel">
        <KMList>
          <li>
            Per-campaign breakdown: same 5 metrics rolled up by campaign.
          </li>
          <li>
            30-day activity sparkline (same buckets as My Dashboard:
            onboardings, payments logged, Sheet View comments).
          </li>
          <li>
            Quick link to <KMCode>/admin/users/&#123;email&#125;</KMCode> for
            audit log + permissions.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Access control">
        <p>
          This page is visible to users whose role grants the{" "}
          <KMCode>performance_view</KMCode> permission scope. Team members
          can see their own row. Admins and team leads see the full matrix.
        </p>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> · onboarded_by, reach_out_date, onboard_date,
            post_date, workflow_status, campaign_id, deliverable_index,
            collab_number.
          </li>
          <li>
            <strong>user_access</strong> · member display names + role.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Attribution accuracy depends on team members logging in before
        onboarding any collab so <KMCode>posts.onboarded_by</KMCode> populates
        correctly. Rows authored by a service account or where login was
        absent surface as Unassigned.
      </KMCallout>
    </>
  );
}
