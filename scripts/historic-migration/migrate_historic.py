#!/usr/bin/env python3
"""
One-time migration: Google Sheets Creator Data → Supabase historic_creator_data.
Downloads the sheet as CSV, maps 48 columns, truncates then bulk-inserts in batches.

Usage:
  python3 /tmp/migrate_historic.py
"""
import csv, json, os, re, sys, urllib.request, urllib.error

# ── Config ─────────────────────────────────────────────────────────────────
SHEET_ID  = "1rh8-TdU4KJqOHOqtgvjtvm5NBo7F9f1Z6FX94sCovXg"
SHEET_GID = "0"
SUPABASE_URL = "https://xynyvbagcudjrzklwnqp.supabase.co"
ENV_FILE = os.path.expanduser(
    "~/Documents/Influencer Project/New Influencer Project/apps/web/.env.local"
)
BATCH_SIZE = 500
TABLE = "historic_creator_data"

# ── Read service role key from .env.local ───────────────────────────────────
def load_service_key():
    for env_name in ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"):
        key = os.environ.get(env_name)
        if key:
            return key
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                for prefix in ("SUPABASE_SERVICE_ROLE_KEY=", "SUPABASE_SERVICE_KEY="):
                    if line.startswith(prefix):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    sys.exit(f"ERROR: SUPABASE_SERVICE_KEY not found in {ENV_FILE}\n"
             "Set it as an env var: SUPABASE_SERVICE_KEY=... python3 migrate_historic.py")

# ── Column map: (sheet_index, table_column_name) ────────────────────────────
# Sheet cols A(0)–AV(47) minus AM(38), then BY(76) = Historic ReachOut
COL_MAP = [
    (0,  "sif_id"),
    (1,  "post_id"),
    (2,  "campaign_id"),
    (3,  "nomenclature"),
    (4,  "entry_date"),
    (5,  "month"),
    (6,  "influencer_name"),
    (7,  "username"),
    (8,  "ig_handle"),
    (9,  "followers"),
    (10, "gender"),
    (11, "influencer_category"),
    (12, "content_name"),
    (13, "content_type"),
    (14, "referred_by"),
    (15, "email_id"),
    (16, "contact_no"),
    (17, "address"),
    (18, "agency_name"),
    (19, "location"),
    (20, "language"),
    (21, "engaged_rate"),
    (22, "avg_likes"),
    (23, "reachout_type"),
    (24, "influencer_callout"),
    (25, "onboard_date"),
    (26, "callout_by"),         # AA — "CALLOUT BY"
    (27, "collab_type"),
    (28, "commercials"),
    (29, "payment_status"),
    (30, "order_id"),
    (31, "order_sent_date"),
    (32, "garments_sent"),
    (33, "tracking_id"),
    (34, "order_status"),
    (35, "order_journey"),
    (36, "posting_journey"),
    (37, "content_delivery_date"),
    # 38 = AM "Blank" — skipped
    (39, "post_date"),
    (40, "link_to_post"),
    (41, "collab_duration"),
    (42, "content_downloaded_link"),
    (43, "remarks"),
    (44, "remarks_2"),
    (45, "raw_dump"),
    (46, "ad_partnership_status"),
    (47, "partnership_active_date"),
    (76, "historic"),            # BY  (DB column renamed historic_reachout -> historic)
]

# ── Helpers ─────────────────────────────────────────────────────────────────
SIF_RE = re.compile(r'^SIF-\d+$', re.IGNORECASE)

def is_data_row(row):
    """Skip blank rows, header repeats, and pivot aggregate rows."""
    sif = row[0].strip() if row else ""
    return bool(SIF_RE.match(sif))

def safe_get(row, idx):
    """Return stripped cell or None (avoids empty-string noise)."""
    try:
        v = row[idx].strip()
        return v if v else None
    except IndexError:
        return None

def post_json(url, data, headers):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    service_key = load_service_key()
    base_headers = {
        "apikey":        service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }

    # 1. Download CSV
    csv_url = (f"https://docs.google.com/spreadsheets/d/{SHEET_ID}"
               f"/export?format=csv&gid={SHEET_GID}")
    print(f"Downloading sheet … ", end="", flush=True)
    with urllib.request.urlopen(csv_url) as resp:
        raw = resp.read().decode("utf-8")
    lines = raw.splitlines()
    print(f"{len(lines)} lines")

    # 2. Parse + filter
    reader = csv.reader(lines)
    next(reader)  # skip header
    rows = [r for r in reader if is_data_row(r)]
    print(f"Data rows after filter: {len(rows)}")

    # 3. Truncate existing data
    print("Truncating existing rows … ", end="", flush=True)
    trunc_url = f"{SUPABASE_URL}/rest/v1/{TABLE}?id=gte.0"
    req = urllib.request.Request(
        trunc_url,
        headers={**base_headers, "Prefer": "return=minimal"},
        method="DELETE"
    )
    # DELETE all: use id >= 0 (covers all identity rows)
    # Actually use RPC or a filter that matches everything
    # Simpler: use POST to rpc truncate or DELETE with a universal filter
    # Supabase REST doesn't support bare DELETE without filter — use id >= 1
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{TABLE}?id=gte.1",
        headers={**base_headers, "Prefer": "return=minimal"},
        method="DELETE"
    )
    try:
        with urllib.request.urlopen(req) as r:
            print(f"done (HTTP {r.status})")
    except urllib.error.HTTPError as e:
        print(f"WARNING: truncate returned {e.code}: {e.read().decode()}")

    # 4. Build records + batch insert
    records = []
    for row in rows:
        rec = {col: safe_get(row, idx) for idx, col in COL_MAP}
        records.append(rec)

    total   = len(records)
    batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
    inserted = 0

    print(f"Inserting {total} rows in {batches} batches of {BATCH_SIZE} … ")
    for i in range(batches):
        batch = records[i*BATCH_SIZE:(i+1)*BATCH_SIZE]
        status, body = post_json(
            f"{SUPABASE_URL}/rest/v1/{TABLE}",
            batch,
            base_headers,
        )
        if status in (200, 201):
            inserted += len(batch)
            print(f"  batch {i+1}/{batches}: {len(batch)} rows OK  [{inserted}/{total}]")
        else:
            print(f"  batch {i+1}/{batches}: ERROR {status}")
            print(f"  response: {body[:500]}")
            sys.exit(1)

    print(f"\nDone. {inserted} rows inserted into {TABLE}.")

if __name__ == "__main__":
    main()
