import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function BudgetKM() {
  return (
    <>
      <KMHeader
        title="Budget"
        subtitle="Month-wise budget versions per campaign — what was sanctioned, what onboardings have committed, and what rolls forward."
      />

      <KMSection tag="What V0, V1, V2 mean">
        <KMList>
          <li>
            <strong>V0 — the first created budget.</strong> Made together with
            the campaign; this is the campaign&apos;s <strong>Actual</strong>{" "}
            everywhere in analytics.
          </li>
          <li>
            <strong>Carry-forward</strong> — money a month didn&apos;t use rolls
            into the next month automatically on the 1st, taking the next
            version number. Same sanctioned money, so no approval needed.
          </li>
          <li>
            <strong>Top-up</strong> — new money added to a running campaign via
            New Campaign → <em>Add budget (existing campaign)</em>. Also takes
            the next number, carries the requester&apos;s{" "}
            <strong>reason</strong>, and waits for Global Admin approval.
          </li>
          <li>
            Numbers are one sequence per campaign: if June&apos;s V0 was fully
            spent inside June, the first top-up becomes V1; if ₹3L carried into
            July as V1, the next top-up becomes V2. Hover any V-chip anywhere in
            the app — the tooltip says which one it is.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="The money math (per campaign, per month)">
        <KMList>
          <li>
            <strong>Allocated</strong> — Σ approved versions pinned to the
            month.
          </li>
          <li>
            <strong>Utilized (Expected)</strong> — what the month&apos;s
            onboarded collabs commit us to spend:{" "}
            <KMCode>Barter + Paid → commercial + order value</KMCode>,{" "}
            <KMCode>Barter → order value</KMCode>. Order value is the Shopify
            order total for the collab&apos;s Order ID; a collab lands in the
            month it was onboarded.
          </li>
          <li>
            <strong>Remaining</strong> — Allocated − Utilized. Whatever is left
            when the month ends becomes next month&apos;s carry-forward version.
            If Utilized exceeds Allocated the campaign shows a red{" "}
            <strong>Over budget</strong> chip and nothing carries forward.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Approvals on this page">
        <p>
          Pending versions (a new campaign&apos;s V0, or a top-up) show{" "}
          <strong>Approve / Reject</strong> buttons — visible only to{" "}
          <strong>Global Admins</strong> (akshay · mahesh · devesh). Admins see
          the page read-only. Approving a top-up makes the money live and raises
          the campaign&apos;s creator cap by the top-up&apos;s creators;
          rejecting a V0 rejects the campaign with it. A campaign cannot be
          approved on the Approvals page until its V0 budget is approved here
          first.
        </p>
      </KMSection>

      <KMSection tag="Month behaviour">
        <KMList>
          <li>
            Month tabs mirror the Sheet View Budget tab. Past months are
            frozen (<KMCode>Closed</KMCode> versions) — history never changes.
          </li>
          <li>
            On the 1st of every month the rollover runs automatically: it
            closes the finished month and creates carry-forward versions for
            every live campaign&apos;s unused balance.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Every existing campaign was backfilled from its first created date —
        its original budget became V0 in its creation month, and unused
        balances were rolled forward month by month, so the history you see
        here is complete from day one.
      </KMCallout>
    </>
  );
}
