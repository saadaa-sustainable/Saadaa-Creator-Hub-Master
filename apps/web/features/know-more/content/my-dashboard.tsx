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

      <KMSection tag="KPI formulas">
        <KMList>
          <li>
            <strong>My Active</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where{" "}
            <KMCode>workflow_status ∈ &#123;Reach Out, On Board, Order
            Sent&#125;</KMCode>. Anything still in the active pipeline under
            your name.
          </li>
          <li>
            <strong>Pending Post</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where workflow_status is On Board or
            Order Sent. Onboarded creators who have not posted yet. Use this
            as your daily chase list.
          </li>
          <li>
            <strong>Posted</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where workflow_status is Posted or
            Delivered.
          </li>
          <li>
            <strong>RTOs</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where workflow_status ∈{" "}
            <KMCode>&#123;RTO, Cancelled, RTO - Reverse Picked, RTO -
            Delivered&#125;</KMCode>.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Commercial amount on rows">
        <KMCallout tone="info">
          Each row&apos;s commercial figure is rewritten at query time to the{" "}
          <strong>collab total</strong> (sum of every sibling&apos;s{" "}
          <KMCode>commercial_amount</KMCode> per
          <KMCode>(inf_id, collab_number)</KMCode>). The per-row equal-split
          value never surfaces in the UI — you always see the originally agreed
          number whether the collab is 1 deliverable or 5.
        </KMCallout>
      </KMSection>

      <KMSection tag="Activity sparkline (footer)">
        <p>
          Each card has a tiny 30-day sparkline tracking your touches across
          the last 30 calendar days. A &quot;touch&quot; counts when:
        </p>
        <KMList>
          <li>
            You onboarded a post (<KMCode>posts.onboarded_by</KMCode> = your
            email and <KMCode>onboard_date</KMCode> falls in the window).
          </li>
          <li>
            You logged a payment (<KMCode>payments.logged_by</KMCode> = your
            email and <KMCode>payments.created_at</KMCode> in window).
          </li>
          <li>
            You authored a Sheet View comment (
            <KMCode>cell_comments.author_email</KMCode> = your email).
          </li>
        </KMList>
        <p>
          The bars are bucketed per calendar day (IST). Empty days render as
          ghost bars so the timeline shape always reads clearly.
        </p>
      </KMSection>

      <KMSection tag="Needs Attention">
        <p>
          The Needs Attention section surfaces two categories of overdue work:
        </p>
        <KMList>
          <li>
            <strong>Overdue delivery</strong> — post is in On Board or Order
            Sent AND <KMCode>est_delivery</KMCode> is set AND that date is
            before today. Days overdue ={" "}
            <KMCode>today − est_delivery</KMCode>.
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
          shows &quot;All caught up.&quot;
        </p>
      </KMSection>

      <KMSection tag="Quick payment modal">
        <p>
          Click the Payment quick-modal on any posted card (parent rows only)
          to log a payment without leaving this stage. The Amount field
          defaults to the <strong>collab total</strong>. On submit:
        </p>
        <KMList>
          <li>
            One payment row inserts against the parent post_id.
          </li>
          <li>
            <KMCode>posts.payment_status</KMCode> cascades to{" "}
            <KMCode>Done</KMCode> on every sibling deliverable.
          </li>
          <li>
            Any pre-existing child payment rows are removed (one payment per
            collab, not per deliverable).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="My Posts list">
        <p>
          The full list of posts assigned to you, sorted newest reach-out date
          first. Toggle between List (desktop table) and Cards (mobile-friendly
          grid). Status chips follow the platform-wide colour convention.
        </p>
      </KMSection>

      <KMCallout tone="info">
        This page shows only YOUR collabs (filtered by{" "}
        <KMCode>onboarded_by</KMCode>). If a collab was onboarded by a
        colleague it will not appear here even if you later worked on it.
      </KMCallout>
    </>
  );
}
