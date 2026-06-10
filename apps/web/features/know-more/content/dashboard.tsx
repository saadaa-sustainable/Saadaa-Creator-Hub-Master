import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function DashboardKM() {
  return (
    <>
      <KMHeader
        title="Dashboard"
        subtitle="Tabbed command centre — an Overview tab of cross-system headline KPIs plus the full bento grid, followed by one tab per SYSTEM-section view, mirroring the sidebar order: Influencer Journey · TAT Analytics · Ad Status · Compliance KPIs · Cost Analytics · Funnel View · Internal Dashboard. Each view tab reuses that feature's FULL page view (same data + KPI strips + boards / charts) — not a reduced summary. Only the active tab fetches data."
      />

      <KMSection tag="Tabbed layout">
        <KMList>
          <li>
            <strong>Underline-active tab bar</strong> · horizontal, scrolls on
            mobile, keyboard-navigable (Arrow / Home / End). The active tab is
            stored in the <KMCode>?tab=</KMCode> URL param so a tab is
            linkable + server-rendered (default <KMCode>overview</KMCode>).
          </li>
          <li>
            <strong>Streaming</strong> · each tab body is its own async server
            component inside a keyed <KMCode>&lt;Suspense&gt;</KMCode>. Only
            the selected tab runs its query — inactive tabs cost nothing.
          </li>
          <li>
            <strong>Overview tab</strong> · cross-system headline strip
            (Active Campaigns · Creators in Pipeline · Total Collabs · Total
            Spend · per-stage counts · pending onboardings / posts / payments /
            paid) on top of the full bento command centre described below.
          </li>
          <li>
            <strong>View tabs</strong> · each tab renders the SAME full view as
            the matching SYSTEM-section route, not a reduced KPI summary —
            Influencer Journey (<KMCode>JourneyPageClient</KMCode>: filter bar +
            KPI strip + funnel strip + kanban board), TAT Analytics
            (<KMCode>TatFiltersBar</KMCode> + <KMCode>TatPageClient</KMCode>:
            KPI strip + three TAT grids + campaign benchmark chart), Ad Status
            (<KMCode>AdStatusFiltersBar</KMCode> + <KMCode>AdStatusKpiStrip</KMCode>{" "}
            + <KMCode>AdStatusBoard</KMCode>), Compliance KPIs
            (<KMCode>ComplianceBody</KMCode>), Cost Analytics
            (<KMCode>CostAnalyticsBody</KMCode>), Funnel View
            (<KMCode>FunnelBody</KMCode>), Internal Dashboard
            (<KMCode>InternalDashboardBody</KMCode>). The component + data fetch
            are reused verbatim; only the duplicate per-page header is dropped
            (the Dashboard shell already shows one).
          </li>
          <li>
            <strong>Pixel parity</strong> · each tab body renders the EXACT
            wrapper its standalone route uses (
            <KMCode>onboarding-stage journey-stage</KMCode>,{" "}
            <KMCode>onboarding-stage ad-status-stage</KMCode>, …) with the same
            children in the same order, so every standalone style (filter cards,
            KPI sizing, inter-section gaps, board / table layout, and the mobile
            rules) applies identically at all breakpoints. Clicking a tab is the
            same as visiting that sidebar page, minus the title. There is no
            Dashboard-specific sizing layer.
          </li>
          <li>
            <strong>Dashboard-only chrome</strong> · the only things unique to
            the Dashboard are the white-pill tab rail (active tab in a rounded
            white pill; scrolls horizontally on mobile with a fade hint) and the
            per-tab Know More (this button shows each tab&apos;s own view KM).
          </li>
          <li>
            <strong>Filters</strong> · the Campaign / Date / Content / Tier /
            Status filter bar applies to the Overview tab only. The Journey,
            TAT, and Ad Status tabs carry their own feature filter bars — their
            URL keys coexist with <KMCode>?tab=</KMCode> without collision.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Overview bento layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — Dashboard icon · title · Know More.
          </li>
          <li>
            <strong>2. Filter strip</strong> — Campaign · Date from · Date to ·
            Content type · Tier · Status · Reset. URL-driven; every block below
            re-renders on change.
          </li>
          <li>
            <strong>3. Row A — Hero + Spotlight</strong> · 8/4 split. Hero card
            says &quot;Pipeline pulse is thriving / warming up / ramping&quot;
            (dynamic by post-rate) with reach-outs → posts summary, conversion
            %, post-rate %, and CTA buttons to Posting + Accounts Hub. Spotlight
            shows Total Spend (30d) with a 30-day SVG sparkline + week-over-week
            % chip.
          </li>
          <li>
            <strong>4. Row B — Today&apos;s Pulse</strong> · 4 cards (Reach-outs
            Today · Onboarded Today · Posts Live Today · Delivered Today). Each
            shows today + delta-vs-yesterday with green/red/flat tone.
          </li>
          <li>
            <strong>5. Row C — Stage Snapshot kanban</strong> · 4 horizontal-
            scroll columns (Reach Out · Onboarding · Posted · Payment). Shows the{" "}
            <strong>latest 10</strong> cards per stage with a{" "}
            <KMCode>+N more →</KMCode> drill-in link; the column-header{" "}
            <strong>badge shows the full bucket total</strong> (not the 10
            shown). Each column has a tinted body bg + top gradient band +
            click-through arrow to the full stage. Cards show stuck-state pill,
            creator avatar + name + handle, post id / campaign / date / amount,
            and an assignee initials roundel + name in the footer.
          </li>
          <li>
            <strong>6. Row D — Action Strip + Posting Goal</strong> · 8/4
            split. 6 deep-link chips (Missing Email · Pending Order · Awaiting
            Post · No Tracking · No Partnership · Overdue). Goal card = radial
            progress of posted ÷ total scope.
          </li>
          <li>
            <strong>7. Row E — Workflow Funnel + 6-month Trend</strong> · 5/7.
            Horizontal bars (Reach Out → On Board → Posted) sized vs the
            largest bucket + 3-line SVG trend (RO / OB / Posted) per month.
          </li>
          <li>
            <strong>7b. Row E2 — Reach-Out Channels (Inbound vs Outbound)</strong>{" "}
            · two side-by-side cards split off <KMCode>reachout_direction</KMCode>{" "}
            (inbound = creators approached us via the inbound roster; outbound =
            our cold reach-outs, incl. legacy null). Each card shows its
            conversion %, Creators / Spend / Posted chips, and a 3-step mini
            funnel sized to its own largest bucket. Respects the dashboard
            filters (campaign / date / tier).
          </li>
          <li>
            <strong>8. Row F — Content Type donut + Creator Tier donut</strong>{" "}
            · 6/6. Inline SVG donuts with center total + legend (brand colour
            palette).
          </li>
          <li>
            <strong>9. Row G — Pipeline KPIs</strong> · 6-card strip (Reach
            Outs · Onboarded with conversion % · Posted with post-rate % ·
            Pending Content · Payment Pending · Ad Winners). Reuses
            <KMCode>.acc-kpi</KMCode> chrome from Accounts Hub.
          </li>
          <li>
            <strong>10. Row H — Top Creators + Team Leaderboard</strong> · 6/6.
            Top 6 creators by followers + post count, then onboardings per
            team member (sorted with progress bars).
          </li>
          <li>
            <strong>11. Row I — Spends per Campaign</strong> · horizontal-bar
            rank, top 8 campaigns by commercial spend.
          </li>
          <li>
            <strong>12. Row J — Campaign &amp; Spend KPIs</strong> · 4-card
            strip (Total Creators · Active Campaigns · Total Spend · Paid
            Collabs).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Per-campaign focus (when filtered)">
        <p>
          Select a single campaign in the filter and a{" "}
          <strong>campaign funnel strip</strong> appears at the top of the
          Overview: <strong>Reached Out</strong> (distinct creators reached out)
          · <strong>Onboarded</strong> <KMCode>Y / cap</KMCode> (with slots-left)
          · <strong>Un-onboarded</strong> (reached out but never onboarded) ·{" "}
          <strong>Posted</strong>. This makes the onboarding-cap story explicit:
          a campaign can have many reach-outs but only <KMCode>cap</KMCode>{" "}
          (Σ <KMCode>num_influencers</KMCode>) onboarded. Computed from a
          dedicated per-campaign query (<KMCode>campaignFocus</KMCode>) so the
          numbers reflect the whole campaign regardless of the date / tier /
          content filters. Un-onboarded leftovers are voided (→ Cancelled) when
          the campaign closes.
        </p>
      </KMSection>

      <KMSection tag="Data source — single Supabase fetch">
        <KMList>
          <li>
            <strong>posts</strong> · 27 columns including workflow_status,
            payment_status, campaign_id, post_date, content_type,
            commercial_amount, reels/static_posts/stories, inf_id, username,
            reach_out_date, onboard_date, onboarded_by, order_id, tracking_id,
            partnership_id, ad_partnership_valid, ads_usage_rights,
            est_delivery, email, collab_email_sent_at, collab_email_skipped,
            deliverable_index, collab_number. Plus extended set adding{" "}
            <KMCode>ads_status</KMCode> with graceful 42703 fallback for
            schemas that haven&apos;t added the column yet.
          </li>
          <li>
            <strong>creators</strong> · username, inf_name, category,
            followers, profile_pic.
          </li>
          <li>
            Server-side filters: campaign · content_type · workflow_status.
            Client-side (in-memory): tier (creator category substring) + date
            range (matches when reach_out_date OR post_date sits in window).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="KPI formulas (Row G + Row J)">
        <KMList>
          <li>
            <strong>Reach Outs</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where workflow_status contains
            &quot;reach out&quot; or is blank.
          </li>
          <li>
            <strong>Onboarded</strong> ·{" "}
            <KMCode>count(posts)</KMCode> with workflow_status &quot;on
            board&quot;. Conversion % = onboarded ÷ reachOut.
          </li>
          <li>
            <strong>Posted</strong> ·{" "}
            <KMCode>count(posts)</KMCode> where workflow_status is Posted or
            Delivered. Post-rate % = posted ÷ onboarded.
          </li>
          <li>
            <strong>Pending Content</strong> · onboarded count minus posted
            count (= rows On Board but not Posted).
          </li>
          <li>
            <strong>Payment Pending</strong> · count of PARENT rows
            (deliverable_index null or 1) whose{" "}
            <KMCode>payment_status</KMCode> is Due or Not Due. Children skip.
          </li>
          <li>
            <strong>Paid Collabs</strong> · count of PARENT rows with{" "}
            <KMCode>payment_status</KMCode> Done or Paid.
          </li>
          <li>
            <strong>Ad Winners</strong> · count of rows where{" "}
            <KMCode>ads_status</KMCode> = <KMCode>Winner</KMCode>. Stays at 0
            on prod schemas where the column hasn&apos;t shipped (graceful
            42703 fallback to BASE columns).
          </li>
          <li>
            <strong>Total Creators</strong> · unique{" "}
            <KMCode>inf_id</KMCode> count in the filter scope.
          </li>
          <li>
            <strong>Active Campaigns</strong> · unique campaign_id touched
            within the date window.
          </li>
          <li>
            <strong>Total Spend</strong> ·{" "}
            <KMCode>Σ posts.commercial_amount</KMCode> across all rows
            (parent + children, since each row holds the equal-split share).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Parent-only payment math">
        <p>
          Payment Pending + Paid Collabs counters skip child deliverables
          (<KMCode>deliverable_index &gt; 1</KMCode>) because payment lives on
          the parent post in Accounts Hub. A 3-deliverable collab paid once
          counts as 1 paid, not 3. The Stage Snapshot kanban also resolves
          each child card&apos;s sub-status from its PARENT row via an{" "}
          <KMCode>(inf_id, collab_number)</KMCode> lookup, so a child of a
          paid collab shows the green <KMCode>SETTLED</KMCode> pill instead
          of a stale <KMCode>PAYMENT PENDING</KMCode>.
        </p>
      </KMSection>

      <KMSection tag="Stage Snapshot bucket rules">
        <KMList>
          <li>
            <strong>Reach Out</strong> · workflow_status contains &quot;reach
            out&quot; (or blank). Sub-label = &quot;Not yet onboarded&quot;.
          </li>
          <li>
            <strong>Onboarding</strong> · workflow_status contains &quot;on
            board&quot;. Sub-label = &quot;Not yet posted&quot;.
          </li>
          <li>
            <strong>Posted</strong> · every deliverable (parent + children) in
            Posted or Delivered status. Sub-label = &quot;Settled&quot; when
            parent payment is Done/Paid, else &quot;Payment pending&quot;.
          </li>
          <li>
            <strong>Payment</strong> · every PARENT in Posted/Delivered (settled
            or pending). Same Settled/Pending sub-label split. Overlaps
            Posted by design — managerial view wants both angles.
          </li>
        </KMList>
        <p>
          Each card surfaces creator avatar + name + handle, post_id_short,
          campaign_id, the relevant stage date + days-waiting counter, and the
          assignee initials roundel (<KMCode>onboarded_by</KMCode> for
          Onboarding/Posted/Payment; Reach Out cards show Unassigned because
          the logged-by column for reach-out has not been wired yet).
        </p>
      </KMSection>

      <KMSection tag="Action chip routing">
        <KMList>
          <li>
            <strong>Missing Email</strong> · On Board / Reach Out with no
            email → <KMCode>/onboarding?missingEmail=1</KMCode>.
          </li>
          <li>
            <strong>Pending Order</strong> · no order_id → onboarding stage.
          </li>
          <li>
            <strong>Awaiting Post</strong> · workflow_status = On Board →
            posting stage.
          </li>
          <li>
            <strong>No Tracking</strong> · order_id present, tracking_id null →
            order-status (transit bucket).
          </li>
          <li>
            <strong>No Partnership</strong> · ads_usage_rights = Yes,
            partnership_id blank → posting stage.
          </li>
          <li>
            <strong>Overdue</strong> · est_delivery in the past, status not
            Delivered/Posted → order-status (pending bucket).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Analytics widgets">
        <KMList>
          <li>
            <strong>Spotlight 30-day sparkline</strong> · sum of{" "}
            <KMCode>commercial_amount</KMCode> per day (across all rows — the
            equal-split values sum back to the originally agreed total per
            collab), normalised to a 100×40 SVG viewBox with a gold gradient
            area + WoW % chip.
          </li>
          <li>
            <strong>Stage Snapshot amount</strong> · per-card amount uses{" "}
            <KMCode>Σ commercial_amount per (inf_id, collab_number)</KMCode>{" "}
            so the parent card surfaces the originally-agreed collab total,
            not the per-row split share.
          </li>
          <li>
            <strong>Posting Goal radial</strong> · stroke-dasharray trick on a
            44px circle; pct = posted ÷ (reachOut + onboarded + posted).
          </li>
          <li>
            <strong>Workflow Funnel</strong> · 3 stacked horizontal bars sized
            relative to the largest bucket. Color-coded per stage tone.
          </li>
          <li>
            <strong>6-month Trend</strong> · 3 polylines on a single SVG (RO
            blue · OB violet · Posted green). Pre-seeded with 6 zero buckets
            so the chart renders even with sparse data.
          </li>
          <li>
            <strong>Donuts</strong> · inline SVG stroke-dasharray rings with
            centered total + legend. Top 6 slices; brand palette only.
          </li>
          <li>
            <strong>Spends per Campaign</strong> · top 8 horizontal bars sorted
            by commercial total, accent gold fill.
          </li>
          <li>
            <strong>Top Creators</strong> · unique creators in scope sorted by
            followers desc; shows tier, compact follower count (K/M), and
            post-count badge.
          </li>
          <li>
            <strong>Team Leaderboard</strong> · groups posts by{" "}
            <KMCode>onboarded_by</KMCode> with onboardings + posts count and a
            relative-width progress bar.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Rules + edge cases">
        <KMList>
          <li>
            KPI counts accumulate over the FULL scope of the campaign +
            content + status filters (server-side). Tier + date filters narrow
            in memory.
          </li>
          <li>
            Delta vs yesterday only counts events whose primary date column
            (reach_out_date / onboard_date / post_date) falls on today vs
            yesterday.
          </li>
          <li>
            Stage Snapshot columns scroll horizontally on every viewport (desktop
            + mobile) so managerial users always see all 4 stages without
            stacking.
          </li>
          <li>
            Dashboard never writes to Supabase — pure read + in-memory
            aggregation. Refresh by tweaking the filter or reloading.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Click any Action chip or Stage Snapshot column header to jump straight
        into the relevant stage with the right filter pre-applied. Hover the
        assignee roundel on any card to see who handled that step.
      </KMCallout>
    </>
  );
}
