import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function MyDashboardKM() {
  return (
    <>
      <KMHeader
        title="My Dashboard"
        subtitle="Personal workload view scoped to your account. Shows every post where you are the onboarding owner — nothing from other team members."
      />

      <KMSection tag="Scope">
        <p>
          All data is filtered to rows where{" "}
          <KMCode>onboarded_by = your login email</KMCode>. The query reads up
          to 500 posts ordered by <KMCode>reach_out_date DESC</KMCode>. You
          cannot see collabs assigned to other team members here. For the full
          team view use the main Dashboard or Internal Dashboard.
        </p>
      </KMSection>

      <KMSection tag="KPI strip">
        <KMList>
          <li>
            <strong>My Active</strong> — posts in Reach Out, On Board, or
            Order Sent. Anything still in the active pipeline under your name.
          </li>
          <li>
            <strong>Pending Post</strong> — posts in On Board or Order Sent.
            These are onboarded creators who have not posted yet. Use this as
            your daily chase list.
          </li>
          <li>
            <strong>Posted</strong> — posts that have reached Posted or
            Delivered status. Content is live or confirmed.
          </li>
          <li>
            <strong>RTOs</strong> — posts in RTO, Cancelled, RTO - Reverse
            Picked, or RTO - Delivered. Tracks failed deliveries in your
            portfolio.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Needs Attention">
        <p>
          The Needs Attention section surfaces two categories of overdue work:
        </p>
        <KMList>
          <li>
            <strong>Overdue delivery</strong> — post is in On Board or Order
            Sent AND <KMCode>est_delivery</KMCode> is set AND that date is
            before today. The product was expected but has not been marked
            delivered. Days overdue is calculated from{" "}
            <KMCode>today - est_delivery</KMCode>.
          </li>
          <li>
            <strong>Awaiting post</strong> — post is in Delivered status AND{" "}
            <KMCode>post_date</KMCode> is null. The creator received the
            product but has not submitted a live post link yet.
          </li>
        </KMList>
        <p>
          Rows are sorted by days overdue descending (most overdue first). A
          maximum of 15 rows are shown. When everything is on track the section
          shows "All caught up."
        </p>
      </KMSection>

      <KMSection tag="My Posts list">
        <p>
          The full list of posts assigned to you, sorted newest reach-out date
          first. Toggle between List (desktop table) and Cards (mobile-friendly
          grid) using the view toggle. On mobile, cards are forced
          automatically.
        </p>
        <p>
          Status chips follow the platform-wide colour convention: accent for
          active, warning for pending, success for posted, danger for
          RTO/Cancelled.
        </p>
      </KMSection>

      <KMSection tag="Daily standup use">
        <KMList>
          <li>Open My Dashboard at the start of each day.</li>
          <li>
            Check Needs Attention first — resolve overdue deliveries and
            chase awaiting-post creators.
          </li>
          <li>
            Use the Pending Post KPI count as your daily chase target.
          </li>
          <li>
            My Active gives a total workload snapshot to report in standup.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        This page shows only YOUR collabs (filtered by{" "}
        <KMCode>onboarded_by</KMCode>). If a collab was onboarded by a
        colleague it will not appear here even if you later worked on it.
      </KMCallout>
    </>
  );
}
