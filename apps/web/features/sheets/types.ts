/**
 * Sheet View — Google-Sheets-style read/edit surface over Supabase tables.
 *
 * Each table is a tab. Cells are editable only when the actor has the
 * `admin` permission AND the column definition has `editable: true`.
 * Edits flow through `updateCell` server action which writes the value
 * back to Supabase via service-role client (RLS bypass safe under `admin`
 * gate).
 *
 * The "Campaign Budget" tab is special — it groups rows by `month_label`
 * (e.g. "May 2026") into sub-tabs that mimic legacy `appendBudgetBlock_`
 * sheet layout (per-month block + TOTAL row).
 */

export type ColType =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "bool"
  | "select"
  | "status";

export interface ColDef {
  key: string;
  label: string;
  type: ColType;
  width?: number; // px
  editable?: boolean;
  options?: string[]; // for select
  // Whether to display this column at all (default true).
  hidden?: boolean;
  /**
   * Virtual column flag — value derived client-side via VIRTUAL_RESOLVERS
   * keyed on `key` (server can't pass functions to client components).
   */
  virtual?: boolean;
}

export interface SheetTable {
  id: string; // route slug ("posts", "campaigns", …)
  label: string; // tab label
  table: string; // Supabase table name
  pk: string; // primary key column name
  columns: ColDef[];
  description?: string;
  defaultSort?: { col: string; dir: "asc" | "desc" };
  rowLimit?: number;
  /** Special handler — e.g. campaign_budget uses month-block layout */
  variant?: "budget";
}

/** Column catalogue — single source of truth for the grid renderer. */
export const SHEET_TABLES: SheetTable[] = [
  {
    id: "posts",
    label: "Posts",
    table: "posts",
    pk: "post_id",
    description: "Per-deliverable workflow rows — Reach Out → Posted → Delivered → Paid",
    defaultSort: { col: "reach_out_date", dir: "desc" },

    columns: [
      {
        key: "__lineage",
        label: "Lineage",
        type: "status",
        width: 90,
        virtual: true,
      },
      { key: "post_id", label: "Post ID", type: "text", width: 140 },
      { key: "post_id_short", label: "Short", type: "text", width: 90 },
      { key: "campaign_id", label: "Campaign", type: "text", width: 90, editable: true },
      { key: "username", label: "Username", type: "text", width: 140 },
      {
        key: "workflow_status",
        label: "Status",
        type: "status",
        width: 110,
        editable: true,
        options: [
          "Reach Out",
          "On Board",
          "Order Sent",
          "Posted",
          "Delivered",
          "RTO",
          "Cancelled",
          "Awaiting Reply",
          "Declined",
        ],
      },
      { key: "reach_out_date", label: "Reach Out", type: "date", width: 110, editable: true },
      { key: "onboard_date", label: "Onboard", type: "date", width: 110, editable: true },
      { key: "order_id", label: "Order ID", type: "text", width: 120, editable: true },
      { key: "order_status", label: "Order Status", type: "text", width: 120, editable: true },
      { key: "tracking_id", label: "Tracking", type: "text", width: 140, editable: true },
      { key: "post_date", label: "Posted", type: "date", width: 110, editable: true },
      { key: "post_link", label: "Post Link", type: "text", width: 220, editable: true },
      { key: "commercial_amount", label: "Commercial ₹", type: "currency", width: 120, editable: true },
      { key: "payment_status", label: "Payment", type: "text", width: 100, editable: true },
      { key: "utr", label: "UTR", type: "text", width: 140, editable: true },
      { key: "payment_date", label: "Paid On", type: "date", width: 110, editable: true },
      { key: "ads_usage_rights", label: "Ads Rights", type: "text", width: 110, editable: true },
      { key: "partnership_id", label: "Partnership ID", type: "text", width: 130, editable: true },
      { key: "deliverable_index", label: "Del Idx", type: "number", width: 70 },
      { key: "collab_number", label: "Collab #", type: "number", width: 70 },
      { key: "inf_id", label: "Inf ID", type: "text", width: 90 },
      { key: "onboarded_by", label: "Onboarded By", type: "text", width: 160 },
      { key: "created_at", label: "Created", type: "datetime", width: 140 },
    ],
  },
  {
    id: "creators",
    label: "Creators",
    table: "creators",
    pk: "inf_id",
    
    columns: [
      { key: "inf_id", label: "Inf ID", type: "text", width: 90 },
      { key: "username", label: "Username", type: "text", width: 140, editable: true },
      { key: "inf_name", label: "Name", type: "text", width: 160, editable: true },
      { key: "category", label: "Tier", type: "text", width: 90, editable: true },
      { key: "followers", label: "Followers", type: "number", width: 100, editable: true },
      { key: "state", label: "State", type: "text", width: 110, editable: true },
      { key: "email", label: "Email", type: "text", width: 200, editable: true },
      { key: "phone", label: "Phone", type: "text", width: 130, editable: true },
      { key: "profile_pic", label: "Profile Pic", type: "text", width: 200 },
      { key: "verification", label: "Verified", type: "text", width: 100 },
      { key: "created_at", label: "Created", type: "datetime", width: 140 },
    ],
  },
  {
    id: "campaigns",
    label: "Campaigns",
    table: "campaigns",
    pk: "campaign_id",
    
    columns: [
      { key: "campaign_id", label: "Campaign ID", type: "text", width: 110 },
      { key: "campaign_name", label: "Name", type: "text", width: 200, editable: true },
      { key: "campaign_num", label: "Num", type: "number", width: 70 },
      { key: "total_budget", label: "Total Budget ₹", type: "currency", width: 140, editable: true },
      { key: "internal_brief_link", label: "Brief Link", type: "text", width: 240, editable: true },
      { key: "start_date", label: "Start", type: "date", width: 110, editable: true },
      { key: "end_date", label: "End", type: "date", width: 110, editable: true },
      { key: "num_creators", label: "# Creators", type: "number", width: 90, editable: true },
      { key: "key_message", label: "Key Message", type: "text", width: 280, editable: true },
      { key: "created_at", label: "Created", type: "datetime", width: 140 },
    ],
  },
  {
    id: "campaign_budget",
    label: "Budget Sheet",
    table: "campaign_budget",
    pk: "id",
    
    variant: "budget",
    description: "Per-month budget allocations — auto-generated when campaign is submitted",
    columns: [
      { key: "tier", label: "Tier", type: "text", width: 110, editable: true },
      { key: "collab_type", label: "Collab Type", type: "text", width: 120, editable: true },
      { key: "campaign_name", label: "Campaign Name", type: "text", width: 180, editable: true },
      { key: "campaign_id", label: "Campaign ID", type: "text", width: 110 },
      { key: "num_influencers", label: "# Influencers", type: "number", width: 110, editable: true },
      { key: "avg_comp", label: "Avg Comp ₹", type: "currency", width: 120, editable: true },
      { key: "total_cost", label: "Total Cost ₹", type: "currency", width: 130 },
      { key: "min_garments", label: "Min Garments", type: "number", width: 110, editable: true },
      { key: "max_garments", label: "Max Garments", type: "number", width: 110, editable: true },
      { key: "est_garment_cost", label: "Est Garment ₹", type: "currency", width: 140 },
      { key: "total_with_garments", label: "Total + Garments ₹", type: "currency", width: 160 },
      { key: "month_label", label: "Month", type: "text", width: 100, hidden: true },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    table: "payments",
    pk: "post_id",
    
    defaultSort: { col: "created_at", dir: "desc" },
    columns: [
      { key: "post_id", label: "Post ID", type: "text", width: 140 },
      { key: "inf_id", label: "Inf ID", type: "text", width: 90 },
      { key: "username", label: "Username", type: "text", width: 140 },
      { key: "amount", label: "Amount ₹", type: "currency", width: 120, editable: true },
      {
        key: "status",
        label: "Status",
        type: "status",
        width: 100,
        editable: true,
        options: ["Not Due", "Due", "Done"],
      },
      { key: "utr", label: "UTR", type: "text", width: 140, editable: true },
      { key: "payment_date", label: "Paid On", type: "date", width: 110, editable: true },
      { key: "due_date", label: "Due", type: "date", width: 110 },
      {
        key: "estimated_payable_date",
        label: "Est Payable",
        type: "date",
        width: 120,
      },
      { key: "bank_name", label: "Bank", type: "text", width: 130, editable: true },
      { key: "bank_number", label: "A/C #", type: "text", width: 140, editable: true },
      { key: "ifsc", label: "IFSC", type: "text", width: 110, editable: true },
      { key: "created_at", label: "Created", type: "datetime", width: 140 },
    ],
  },
  {
    id: "shopify_orders",
    label: "Shopify Orders",
    table: "shopify_orders",
    pk: "order_id",
    
    columns: [
      { key: "order_id", label: "Order ID", type: "text", width: 130 },
      { key: "name", label: "Name", type: "text", width: 110 },
      { key: "customer_name", label: "Customer", type: "text", width: 160 },
      { key: "total_price", label: "Total ₹", type: "currency", width: 110 },
      { key: "tracking_status", label: "Status", type: "text", width: 120 },
      { key: "tracking_number", label: "Tracking", type: "text", width: 140 },
      { key: "order_placed_date", label: "Placed", type: "date", width: 110 },
      { key: "delivered_date", label: "Delivered", type: "date", width: 110 },
      { key: "created_at", label: "Created", type: "datetime", width: 140 },
    ],
  },
  {
    id: "system_errors",
    label: "System Errors",
    table: "system_errors",
    pk: "id",
    
    defaultSort: { col: "created_at", dir: "desc" },
    columns: [
      { key: "id", label: "ID", type: "number", width: 70 },
      { key: "type", label: "Type", type: "text", width: 140 },
      { key: "key", label: "Key", type: "text", width: 160 },
      { key: "message", label: "Message", type: "text", width: 320 },
      { key: "source", label: "Source", type: "text", width: 160 },
      { key: "resolved", label: "Resolved", type: "bool", width: 90, editable: true },
      { key: "resolved_at", label: "Resolved At", type: "datetime", width: 140 },
      { key: "created_at", label: "Created", type: "datetime", width: 140 },
    ],
  },
  {
    id: "instagram_cache",
    label: "Instagram Cache",
    table: "instagram_cache",
    pk: "username",
    
    columns: [
      { key: "username", label: "Username", type: "text", width: 140 },
      { key: "followers", label: "Followers", type: "number", width: 100 },
      { key: "er", label: "ER", type: "number", width: 70 },
      { key: "avg_likes", label: "Avg Likes", type: "number", width: 90 },
      { key: "is_verified", label: "Verified", type: "bool", width: 80 },
      { key: "status", label: "Status", type: "text", width: 90 },
      { key: "attempts", label: "Attempts", type: "number", width: 80 },
      { key: "scraped_at", label: "Scraped", type: "datetime", width: 140 },
      { key: "updated_at", label: "Updated", type: "datetime", width: 140 },
    ],
  },
  {
    id: "inbound_reachout_queue",
    label: "Inbound Queue",
    table: "inbound_reachout_queue",
    pk: "id",
    
    defaultSort: { col: "created_at", dir: "desc" },
    columns: [
      { key: "id", label: "ID", type: "number", width: 70 },
      { key: "username", label: "Username", type: "text", width: 140 },
      { key: "name", label: "Name", type: "text", width: 160 },
      { key: "category", label: "Category", type: "text", width: 110 },
      { key: "followers", label: "Followers", type: "number", width: 100 },
      { key: "status", label: "Status", type: "text", width: 110 },
      { key: "created_at", label: "Created", type: "datetime", width: 140 },
    ],
  },
  {
    id: "user_access",
    label: "User Access",
    table: "user_access",
    pk: "email",
    
    columns: [
      { key: "email", label: "Email", type: "text", width: 220 },
      { key: "name", label: "Name", type: "text", width: 160, editable: true },
      { key: "role", label: "Role", type: "text", width: 140, editable: true },
      { key: "active", label: "Active", type: "bool", width: 80, editable: true },
      { key: "created_at", label: "Created", type: "datetime", width: 140 },
    ],
  },
];

export interface SheetRow {
  [key: string]: unknown;
}

/**
 * Infer ColType from a column-name convention so untyped extras coming from
 * Supabase get sensible rendering without manual schema entry.
 */
export function inferColType(key: string): ColType {
  const k = key.toLowerCase();
  if (k.endsWith("_at")) return "datetime";
  if (k.endsWith("_date")) return "date";
  if (
    k.includes("amount") ||
    k.includes("rate") ||
    k.includes("budget") ||
    k.includes("cost") ||
    k.includes("price") ||
    k.includes("comp")
  )
    return "currency";
  if (
    k.endsWith("_count") ||
    k === "followers" ||
    k === "id" ||
    k === "attempts" ||
    k.endsWith("_index") ||
    k.endsWith("_number")
  )
    return "number";
  if (
    k.startsWith("is_") ||
    k.startsWith("has_") ||
    k === "active" ||
    k === "resolved" ||
    k.endsWith("_valid")
  )
    return "bool";
  if (k.endsWith("status")) return "status";
  return "text";
}

/**
 * Columns retired from the data model — never surface even if old data
 * shipments still carry them. Single source so backend + UI stay in sync.
 */
const RETIRED_COLUMNS = new Set<string>([
  "commercial_reel_rate",
  "commercial_post_rate",
  "commercial_story_rate",
  "collab_message",
  "match_status",
]);

/**
 * Merge schema-defined columns with any extra keys discovered in the row
 * data so the grid reflects the FULL Supabase column set, including columns
 * we haven't curated. Virtual columns and curated metadata take precedence.
 */
export function mergeColumns(
  defined: ColDef[],
  rows: SheetRow[],
): ColDef[] {
  const definedKeys = new Set(defined.map((c) => c.key));
  const extraKeys: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (RETIRED_COLUMNS.has(k)) continue;
      if (!definedKeys.has(k) && !extraKeys.includes(k)) extraKeys.push(k);
    }
  }
  const extras: ColDef[] = extraKeys.map((k) => ({
    key: k,
    label: prettyLabel(k),
    type: inferColType(k),
    width: 130,
  }));
  return [...defined, ...extras].filter((c) => !RETIRED_COLUMNS.has(c.key));
}

function prettyLabel(key: string): string {
  return key
    .split("_")
    .map((p) => (p.length <= 3 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
}

export interface SheetData {
  rows: SheetRow[];
  rowCount: number;
  tableId: string;
}
