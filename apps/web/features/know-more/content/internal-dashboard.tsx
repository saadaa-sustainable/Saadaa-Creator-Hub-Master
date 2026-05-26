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
          <KMCode>posts.logged_by</KMCode> (the person who created or last updated the
          record). If <KMCode>logged_by</KMCode> is null, the post counts toward
          &quot;Unassigned&quot;.
        </p>
      </KMSection>

      <KMSection tag="Metric definitions">
        <KMList>
          <li>
            <strong>RO Count</strong> · posts created (reach_out_date in period) by
            this member.
          </li>
          <li>
            <strong>Onboard Count</strong> · posts reaching On Board in period attributed
            to this member.
          </li>
          <li>
            <strong>Post Count</strong> · posts reaching Posted in period attributed to
            this member.
          </li>
          <li>
            <strong>Delivery Rate</strong> · Delivered / (Posted + Delivered) for this
            member&apos;s posts.
          </li>
          <li>
            <strong>Avg TAT</strong> · median RO→Post days for this member&apos;s posts
            in the period.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Access control">
        <p>
          This page is visible to users with the{" "}
          <KMCode>internal_dashboard:view</KMCode> permission. Team members can see
          their own row. Admins and team leads see the full matrix.
        </p>
      </KMSection>

      <KMSection tag="Data sources">
        <KMList>
          <li>
            <strong>posts</strong> · logged_by, reach_out_date, onboard_date,
            posted_on_date, workflow_status, campaign_id.
          </li>
          <li>
            <strong>user_access</strong> · member display names and roles.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Attribution accuracy depends on the <KMCode>posts.logged_by</KMCode> column
        being populated. If many posts show as Unassigned, ensure team members are
        logged in when creating or updating records.
      </KMCallout>
    </>
  );
}
