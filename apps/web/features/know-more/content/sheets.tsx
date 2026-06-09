import { KMCallout, KMCode, KMHeader, KMList, KMSection } from "../km-shell";

export default function SheetsKM() {
  return (
    <>
      <KMHeader
        title="Sheet View"
        subtitle="Google-Sheets-style tabbed grid over every Supabase table. Cell-level edit, comment threads with @-mention email fanout, and Global-Admin row delete with a restore log. Admin-only writes."
      />

      <KMSection tag="Page layout (top → bottom)">
        <KMList>
          <li>
            <strong>1. Tab bar</strong> — one tab per Supabase table (Posts ·
            Creators · Campaigns · Budget Sheet · Payments · Shopify Orders ·
            System Errors · Instagram Cache · Inbound Queue · User Access).
            Live row counts via parallel <KMCode>head:true</KMCode> count
            fetches.
          </li>
          <li>
            <strong>2. Toolbar</strong> — search, Edit mode toggle, Density
            (Cozy / Compact), column visibility menu, CSV export. For Global
            Admins on operational tabs: a <strong>Trash</strong> (recently
            deleted) button and a red <strong>Delete N</strong> button that
            acts on the row checkboxes.
          </li>
          <li>
            <strong>3. Grid</strong> — column letter (A, B, C…), type icon,
            label, sort arrow, edit pencil (when editable), pin button (right
            side, hover-revealed; gold when active).
          </li>
          <li>
            <strong>4. Status bar</strong> — selected cell coords + keyboard
            shortcut legend.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Editable surface">
        <KMList>
          <li>
            <strong>Admin gate</strong> ·{" "}
            <KMCode>assertPermission(&quot;admin&quot;)</KMCode> on{" "}
            <KMCode>updateSheetCell</KMCode>. Non-admins see the grid read-only.
          </li>
          <li>
            <strong>Per-column edit flag</strong> · only columns with{" "}
            <KMCode>editable: true</KMCode> in{" "}
            <KMCode>features/sheets/types.ts</KMCode> render the edit pencil.
          </li>
          <li>
            <strong>Type coercion</strong> · server-side <KMCode>coerce()</KMCode>{" "}
            parses number / date / datetime / bool. Bad input returns an error,
            never writes a corrupt value.
          </li>
          <li>
            <strong>Service-role write</strong> · admin-gated server action
            bypasses RLS so all 10 tables share the same write path without
            per-table policies.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Column features">
        <KMList>
          <li>
            <strong>Virtual columns</strong> · resolved client-side via the{" "}
            <KMCode>VIRTUAL_RESOLVERS</KMCode> map (functions can&apos;t cross the
            RSC boundary). None active today — the old{" "}
            <KMCode>__lineage</KMCode> column was retired with the collab-id
            model. The mechanism stays for future derived columns.
          </li>
          <li>
            <strong>Dynamic merge</strong> ·{" "}
            <KMCode>mergeColumns()</KMCode> picks up any Supabase column not in
            the curated list so prod-schema drift surfaces immediately. Type is
            inferred from the column name (<KMCode>_at</KMCode> → datetime,{" "}
            <KMCode>amount</KMCode> → currency, etc.).
          </li>
          <li>
            <strong>Retired columns</strong> · the
            <KMCode>RETIRED_COLUMNS</KMCode> set (e.g.{" "}
            <KMCode>commercial_reel_rate</KMCode>) is filtered out even if old
            rows still carry the key.
          </li>
          <li>
            <strong>Per-column pin / freeze</strong> · click the pin icon in a
            header. Pinned columns reorder to the left and stick via{" "}
            <KMCode>position: sticky</KMCode>. The # column auto-freezes only
            when at least one other column is pinned.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Pagination">
        <KMCallout tone="info">
          PostgREST caps responses at 1000 rows. Sheet View streams the entire
          table by looping <KMCode>.range(from, to)</KMCode> with{" "}
          <KMCode>PAGE_SIZE=1000</KMCode> and{" "}
          <KMCode>MAX_ROWS=50000</KMCode> until an empty page lands. Counts are
          fetched via parallel <KMCode>head:true</KMCode> queries so the tab
          badge reflects the true row count.
        </KMCallout>
      </KMSection>

      <KMSection tag="Cell comments + @-mentions">
        <KMList>
          <li>
            <strong>cell_comments table</strong> · keyed on{" "}
            <KMCode>(table_id, row_pk, column_key)</KMCode>. Stores body,
            mentions (text[]), author, resolved state, before/after timestamps.
          </li>
          <li>
            <strong>Marker</strong> · accent badge top-right of any cell with
            comments. Hovering an empty cell reveals a ghost icon to start a
            thread.
          </li>
          <li>
            <strong>@-mention picker</strong> · type{" "}
            <KMCode>@</KMCode>; live search against{" "}
            <KMCode>user_access</KMCode>. Only emails present in user_access
            persist as valid mentions; unknowns silently drop.
          </li>
          <li>
            <strong>Email fanout</strong> · every valid mention triggers a
            Gmail SMTP send via <KMCode>lib/email.ts</KMCode> (same pipeline as
            the collab brief). Self-mentions ALSO send so admins can sanity-test
            the setup. Failures land in
            <KMCode>system_errors.type=&apos;comment_mention_email&apos;</KMCode>{" "}
            (Error Portal).
          </li>
          <li>
            <strong>Resolve / re-open / delete</strong> · author-only delete;
            anyone with admin scope can resolve/re-open. Resolution surfaces in
            the per-cell badge state.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Edited badge + revised-details email">
        <KMList>
          <li>
            <strong>Edit audit</strong> · every successful cell write logs a row
            to <KMCode>cell_edits</KMCode> (sheet, row, column, old → new value,
            editor, timestamp). Logging fails soft — if the table isn&apos;t
            migrated yet the edit still saves.
          </li>
          <li>
            <strong>&quot;edited&quot; badge</strong> · cells changed in the
            last <strong>7 days</strong> show a small amber badge (bottom-left)
            with a tooltip of <KMCode>editor · timestamp</KMCode>. Older edits
            drop out of the query, so the badge fades automatically after 7
            days.
          </li>
          <li>
            <strong>Revised-details email</strong> · editing a critical column
            (<KMCode>order_status</KMCode>, <KMCode>delivery_date</KMCode>,{" "}
            <KMCode>est_delivery</KMCode>, <KMCode>delivered_date</KMCode>,{" "}
            <KMCode>commercial_amount</KMCode>, <KMCode>email</KMCode>,{" "}
            <KMCode>bank_name</KMCode>, <KMCode>bank_number</KMCode>,{" "}
            <KMCode>ifsc</KMCode>, <KMCode>order_id</KMCode>) sends an
            old → new diff email to the creator + the row&apos;s{" "}
            <KMCode>onboarded_by</KMCode> user. Best-effort: a missing recipient
            is skipped. Non-critical edits get the badge only — no email.
          </li>
          <li>
            <strong>Non-blocking + logged</strong> · the email fires via
            Next.js <KMCode>after()</KMCode> (same as the collab brief) so the
            cell update stays fast; each send is recorded in{" "}
            <KMCode>email_logs</KMCode> with{" "}
            <KMCode>email_type=&apos;sheet_revision&apos;</KMCode> and failures
            land in <KMCode>system_errors</KMCode>.
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Row delete + restore (Global-Admin only)">
        <KMList>
          <li>
            <strong>Who</strong> · only Global Admins. The grid surfaces
            checkboxes + Delete only when{" "}
            <KMCode>hasPermission(actor, &quot;admin&quot;)</KMCode>; the{" "}
            <KMCode>deleteSheetRows</KMCode> action re-checks via{" "}
            <KMCode>assertPermission(&quot;admin&quot;)</KMCode>. It is its own
            gate, decoupled from edit permission.
          </li>
          <li>
            <strong>Where</strong> · operational tabs only —{" "}
            <KMCode>deletable: true</KMCode> in{" "}
            <KMCode>types.ts</KMCode> on Posts, Creators, Campaigns, Budget,
            Payments, Inbound Queue, System Errors. <strong>Not</strong> User
            Access (manage via Access Hub) or the cron-synced Shopify /
            Instagram caches (they just re-sync).
          </li>
          <li>
            <strong>Select &amp; delete</strong> · per-row checkbox + a
            header select-all (visible rows). Delete opens a confirm dialog;
            bulk deletes of <strong>10+</strong> rows require typing{" "}
            <KMCode>DELETE</KMCode>.
          </li>
          <li>
            <strong>Hard delete + restore log</strong> · each row is
            snapshotted (full JSON) into <KMCode>row_deletions</KMCode> before
            removal, so nothing is silently lost. A toast offers{" "}
            <strong>Undo</strong> immediately; the <strong>Trash</strong>{" "}
            button lists the last 30 days per tab with per-row{" "}
            <strong>Restore</strong>. Restore strips generated columns (e.g.
            budget <KMCode>total_cost</KMCode>) and re-inserts the original PK.
          </li>
          <li>
            <strong>FK is the guardrail</strong> · Postgres blocks deletes
            that would orphan data and the action turns the{" "}
            <KMCode>23503</KMCode> into a friendly &quot;still referenced by
            payments — delete those first&quot;. Deleting a campaign
            cascade-removes its budget blocks and nulls{" "}
            <KMCode>posts.campaign_id</KMCode> (DB rules, not app logic).
          </li>
        </KMList>
      </KMSection>

      <KMSection tag="Edge cases handled">
        <KMList>
          <li>
            Function-valued <KMCode>virtual</KMCode> field was crashing with
            &quot;Functions cannot be passed directly to Client Components&quot; — flag
            is now boolean only, resolver lives client-side.
          </li>
          <li>
            <KMCode>onChange</KMCode> from parent into the comment thread used
            to fire on every render → infinite loop. Replaced with{" "}
            <KMCode>useRef</KMCode>-stored callback + first-render guard.
          </li>
          <li>
            Some Supabase tables (creators, shopify_orders, inbound queue)
            occasionally returned PostgREST 42703 on missing columns. Resolved
            via <KMCode>select(&quot;*&quot;)</KMCode> + retired-column filter.
          </li>
        </KMList>
      </KMSection>
    </>
  );
}
