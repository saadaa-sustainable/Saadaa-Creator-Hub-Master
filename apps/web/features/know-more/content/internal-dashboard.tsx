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
          Attribution is stage-specific: Reach Out uses{" "}
          <KMCode>posts.logged_by</KMCode>, Onboarding uses{" "}
          <KMCode>posts.onboarded_by</KMCode>, and Posted uses{" "}
          <KMCode>posts.posted_by</KMCode>. Older rows fall back to the next
          available owner. A member can therefore appear on more than one row
          for the same collab when work was handed off between stages.
        </p>
      </KMSection>

      <KMSection tag="Metric formulas">
        <KMList>
          <li>
            <strong>RO Count</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where reach_out_date in period
            AND logged_by = this member (falling back to onboarded_by).
          </li>
          <li>
            <strong>Onboard Count</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where onboard_date in period AND
            onboarded_by = this member (falling back to logged_by).
          </li>
          <li>
            <strong>Post Count</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where post_date in period AND
            posted_by = this member (falling back to onboarded_by/logged_by).
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
            <strong>posts</strong> · logged_by, onboarded_by, posted_by,
            reach_out_date, onboard_date, post_date, workflow_status, campaign_id,
            deliverable_index, collab_number.
          </li>
          <li>
            <strong>user_access</strong> · member display names + role.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        The Team Member activity rows are clickable and open the full lifecycle
        history. Rows with no usable stage owner surface as Unassigned.
      </KMCallout>
    </>
  );
}
