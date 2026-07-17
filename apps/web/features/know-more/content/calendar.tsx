import { KMCallout, KMHeader, KMList, KMSection } from "../km-shell";

export default function CalendarKM() {
  return (
    <>
      <KMHeader
        title="Content Calendar"
        subtitle="Month / week / schedule views of the content pipeline: when onboarded collabs are DUE to deliver (Est. Delivery) and when posts actually WENT LIVE (Posted). Ported from the Workflow Optimizer calendar."
      />

      <KMSection tag="What's on the calendar">
        <KMList>
          <li>
            <strong>Est. Delivery (amber)</strong> — one event per ONBOARDED
            collab (On Board / Order Sent) on its promised delivery date from
            the onboarding form. A red warning marks <strong>overdue</strong>{" "}
            deliveries: the promised date passed and nothing was posted (same
            rule as the Overdue KPIs — day after est. delivery).
          </li>
          <li>
            <strong>Posted (green)</strong> — one event per posted deliverable
            on its actual post date (captured from the live Instagram post at
            submit).
          </li>
          <li>
            Every event reads <strong>@creator · POST ID</strong>. Click a day
            to open its popup: collab id, campaign, collab type, order id, and
            who onboarded / posted it.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Views & navigation">
        <KMList>
          <li>
            <strong>Month</strong> (default) — classic grid, up to 3 chips per
            day then "+N more"; click a day for the full list.
          </li>
          <li>
            <strong>Week</strong> — Sun–Sat columns around the focused day;
            Prev/Next week stays inside the month.
          </li>
          <li>
            <strong>Schedule</strong> — agenda list of every event in the
            month, deliveries before posts within a day.
          </li>
          <li>
            The left rail's mini-calendar jumps between days (dots mark days
            with events) and the legend shows this month's counts. Arrows /
            "Today" move between months via the URL (shareable).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Access & data">
        <KMList>
          <li>Read-only; every logged-in team member can open it.</li>
          <li>
            Data comes live from the posts pipeline — no separate calendar
            entries to maintain. Test-mode rows are excluded.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        The calendar answers two questions at a glance: "what content is due
        this week (and what's late)?" and "what actually went live?". Use the
        Week view in stand-ups; overdue marks match the Overdue KPIs on the
        Onboarding and Posting pages.
      </KMCallout>
    </>
  );
}
