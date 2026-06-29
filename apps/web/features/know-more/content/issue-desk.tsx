import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function IssueDeskKM() {
  return (
    <>
      <KMHeader
        title="Issue Desk"
        subtitle="Raise a workflow issue, bug, access request or suggestion — and track it to resolution. Anyone can raise a ticket; admins resolve them."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. PageHeader</strong> — LifeBuoy icon + title + Know More.
          </li>
          <li>
            <strong>2. KPI strip</strong> — All · Open · In progress · Resolved ·
            Urgent (live counts).
          </li>
          <li>
            <strong>3. Raise a Ticket</strong> (left) — title, details, category,
            priority, an optional linked record, and submit.
          </li>
          <li>
            <strong>4. Resolution Queue</strong> (right) — search + status tabs +
            the ticket list. Each ticket expands to show the full detail; admins
            get the controls to update it.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Raising a ticket">
        <KMList>
          <li>
            <strong>Category</strong> · <KMCode>workflow</KMCode>,{" "}
            <KMCode>access</KMCode>, <KMCode>data</KMCode>, <KMCode>bug</KMCode>,{" "}
            <KMCode>suggestion</KMCode>, <KMCode>other</KMCode>.
          </li>
          <li>
            <strong>Priority</strong> · low / medium / high / urgent. Urgent
            tickets surface in the KPI strip until closed.
          </li>
          <li>
            <strong>Linked record</strong> · optional autocomplete over CreatorHub
            entities — a campaign (<KMCode>IFC…</KMCode>), creator
            (<KMCode>SIF-…</KMCode> / @handle) or collab — so the resolver has
            context. You can also type a free note.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Lifecycle (admins)">
        <p>
          <KMCode>open</KMCode> → <KMCode>in_progress</KMCode> →{" "}
          <KMCode>resolved</KMCode> → <KMCode>closed</KMCode>. An admin sets the
          status, an internal <strong>admin note</strong>, and a{" "}
          <strong>resolution</strong> shown to the requester. Resolving stamps{" "}
          <KMCode>resolved_at</KMCode>; closing stamps <KMCode>closed_at</KMCode>.
        </p>
      </KMSection>

      <KMSection tag="Who sees what">
        <KMList>
          <li>
            <strong>Everyone</strong> · can raise tickets and see their own.
          </li>
          <li>
            <strong>Admins</strong> · see every ticket and the resolution
            controls.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Data source">
        <KMList>
          <li>
            <strong>support_tickets</strong> · ticket_no, title, description,
            category, priority, status, requester + admin fields, resolution,
            timestamps.
          </li>
        </KMList>
      </KMSection>

      <KMCallout tone="info">
        Use this for anything that blocks your work — a wrong number, a missing
        permission, a bug, or an idea. Link the campaign / creator it's about so
        it's quick to action.
      </KMCallout>
    </>
  );
}
