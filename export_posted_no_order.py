#!/usr/bin/env python3
"""
export_posted_no_order.py — one-off export of historic_posts rows that are
POSTED but have NO order_id (the broken-flow set, ~164 rows). Writes a CSV with
a blank `order_id` column for you to fill, then re-ingest + run the Shopify sync.

Reads Supabase creds from apps/web/.env.local (same as sync_shopify_orders.py).
Read-only on the DB. Usage:  python3 export_posted_no_order.py
"""
import os, csv, json, urllib.parse, urllib.request
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent / "apps" / "web" / ".env.local"
_ENV = {}
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        _ENV[k.strip()] = v.strip().strip('"').strip("'")

def env(name, default=None):
    return os.environ.get(name) or _ENV.get(name) or default

URL = env("NEXT_PUBLIC_SUPABASE_URL")
KEY = env("SUPABASE_SERVICE_KEY") or env("SUPABASE_SERVICE_ROLE_KEY")
if not URL or not KEY:
    raise SystemExit("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY in apps/web/.env.local")

COLS = [
    "id", "source_cleaned_id", "inf_id", "post_id", "username",
    "post_date", "post_link", "nomenclature", "content_type", "collab_type",
    "commercial_amount", "payment_status", "email", "order_id",
]

# Pull every Posted row, then keep the ones with empty order_id (matches the
# SQL `workflow_status='Posted' AND coalesce(order_id,'')=''`).
rows, offset, page = [], 0, 1000
while True:
    qs = urllib.parse.urlencode({
        "select": ",".join(COLS),
        "workflow_status": "eq.Posted",
        "order": "inf_id.asc,post_number.asc",
        "limit": page, "offset": offset,
    })
    req = urllib.request.Request(
        f"{URL}/rest/v1/historic_posts?{qs}",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        batch = json.loads(resp.read().decode())
    rows.extend(batch)
    if len(batch) < page:
        break
    offset += page

target = [row for row in rows if not (row.get("order_id") or "").strip()]

out = Path(__file__).resolve().parent / "historic_posted_no_order_164.csv"
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    for row in target:
        row["order_id"] = ""  # blank for you to fill
        w.writerow({c: row.get(c, "") for c in COLS})

print(f"posted_total={len(rows)} posted_no_order={len(target)}")
print(f"wrote {out}")
