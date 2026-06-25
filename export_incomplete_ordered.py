#!/usr/bin/env python3
"""
export_incomplete_ordered.py — one-off export of historic_posts rows that HAVE
an order_id + a real Instagram link but are MISSING post_date and/or nomenclature
(~9 rows). Writes a CSV with blank post_date / nomenclature columns to fill, then
re-ingest by id. Reads Supabase creds from apps/web/.env.local. Read-only.
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

COLS = ["id", "source_cleaned_id", "inf_id", "post_id", "username", "order_id",
        "post_link", "content_type", "collab_id", "post_date", "nomenclature"]

# Pull rows that have an order_id and a real IG link, then keep the ones missing
# post_date or nomenclature.
rows, offset, page = [], 0, 1000
while True:
    qs = urllib.parse.urlencode({
        "select": ",".join(COLS),
        "order_id": "not.is.null",
        "post_link": "ilike.*instagram.com*",
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

def missing(r):
    return not (r.get("post_date") or "").strip() or not (r.get("nomenclature") or "").strip()

target = [r for r in rows if missing(r)]

out = Path(__file__).resolve().parent / "historic_incomplete_ordered.csv"
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    for r in target:
        w.writerow({c: (r.get(c) if r.get(c) is not None else "") for c in COLS})

print(f"ordered_with_link={len(rows)} incomplete={len(target)}")
print(f"wrote {out}")
