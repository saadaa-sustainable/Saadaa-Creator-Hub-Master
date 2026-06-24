"""
sync_shopify_orders.py — LOCAL replacement for the Supabase `sync-shopify-orders`
edge function + its pg_cron. Pulls Shopify Admin orders tagged `inf` (last
SHOPIFY_DAYS_BACK days, Link-header paginated) and upserts them into
`shopify_orders` via the Supabase REST API. Runs on an interval so you host it
yourself (laptop / cheap VPS / a GitHub Action) instead of paying per Supabase
cron + edge-function invocation.

Mirrors the edge function's mapOrder() field mapping 1:1 so the data is identical.
Supabase stays the sole source of truth. Read-only on Shopify (read_orders).

USAGE
  # one pass, no loop (cron-equivalent of a single run)
  python sync_shopify_orders.py --once

  # daemon: run every 3 hours forever (default 10800s)
  python sync_shopify_orders.py

  # custom interval (seconds) + wider backfill window
  python sync_shopify_orders.py --interval 7200 --days-back 30

  # one-off backfill of a single order id
  python sync_shopify_orders.py --order-id 1234567890

ENV (read from apps/web/.env.local, override via real env):
  SHOPIFY_ADMIN_TOKEN          (required)  Admin API token, read_orders
  SHOPIFY_STORE_DOMAIN         default 'saadaa-design.myshopify.com'
  SHOPIFY_API_VERSION          default '2024-10'
  SHOPIFY_DAYS_BACK            default 14    (bulk window)
  SHOPIFY_MAX_PAGES            default 4     (250 orders/page)
  SHOPIFY_ORDER_TAGS           default 'inf' (comma list, OR-match, case-insensitive)
  NEXT_PUBLIC_SUPABASE_URL     (required)
  SUPABASE_SERVICE_KEY         (required)

Revert to the Supabase cron: docs/SHOPIFY-SYNC-REVERT.md
"""
import os, re, sys, json, time, argparse, datetime as dt
from pathlib import Path
import requests

ENV_FILE = Path(__file__).resolve().parent / "apps" / "web" / ".env.local"

def load_env(path):
    env = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

_ENV = load_env(ENV_FILE)
def gv(name, default=None):
    return (os.environ.get(name) or _ENV.get(name) or default)

SHOPIFY_TOKEN  = gv("SHOPIFY_ADMIN_TOKEN") or gv("SHOPIFY_ADMIN_API_TOKEN")
STORE_DOMAIN   = gv("SHOPIFY_STORE_DOMAIN", "saadaa-design.myshopify.com")
API_VERSION    = gv("SHOPIFY_API_VERSION", "2024-10")
DAYS_BACK      = int(gv("SHOPIFY_DAYS_BACK", "14"))
MAX_PAGES      = int(gv("SHOPIFY_MAX_PAGES", "4"))
ORDER_TAGS     = [t.strip().upper() for t in gv("SHOPIFY_ORDER_TAGS", "inf").split(",") if t.strip()]
SB_URL         = (gv("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SB_KEY         = gv("SUPABASE_SERVICE_KEY") or gv("SUPABASE_SERVICE_ROLE_KEY")

ORDER_FIELDS = ("id,order_number,name,email,phone,created_at,processed_at,cancelled_at,"
                "cancel_reason,financial_status,fulfillment_status,total_price,subtotal_price,"
                "total_discounts,discount_codes,tags,note,customer,shipping_address,"
                "billing_address,line_items,fulfillments,refunds")

_SECRET_RE = re.compile(r"(shpat_[A-Za-z0-9]+|eyJ[\w\-.]{20,})")
def scrub(s):
    try: return _SECRET_RE.sub("<REDACTED>", str(s))
    except Exception: return "<scrub_err>"
def log(*a):
    print(dt.datetime.now().strftime("%H:%M:%S"), " ".join(scrub(x) for x in a), flush=True)

# ── mapOrder — replicates supabase/functions/sync-shopify-orders/index.ts ─────
def fmt_date(d):
    if not d: return None
    try: return dt.datetime.fromisoformat(str(d).replace("Z", "+00:00")).date().isoformat()
    except Exception: return None

def flatten_address(a):
    if not a: return None
    parts = [a.get(k) for k in ("address1", "address2", "city", "province", "zip", "country")]
    parts = [p for p in parts if p and str(p).strip()]
    return ", ".join(parts) if parts else None

def num_or_none(v):
    try:
        n = float(v)
        return n if n else None
    except (TypeError, ValueError):
        return None

def map_order(o):
    cust = o.get("customer") or {}
    customer_name = " ".join(filter(None, [cust.get("first_name"), cust.get("last_name")])) or None

    line_items = o.get("line_items") or []
    line_skus = ", ".join(li["sku"] for li in line_items if li.get("sku")) or None
    garments_sent = ", ".join((li.get("title") or li.get("name")) for li in line_items
                              if (li.get("title") or li.get("name"))) or None

    fuls = sorted(o.get("fulfillments") or [],
                  key=lambda f: str(f.get("updated_at") or f.get("created_at") or ""),
                  reverse=True)
    latest = fuls[0] if fuls else None
    chain = " → ".join(reversed([
        (f"{fmt_date(f.get('created_at') or f.get('updated_at'))} "
         f"{f.get('shipment_status') or f.get('status') or 'Unknown'}").strip()
        if fmt_date(f.get("created_at") or f.get("updated_at"))
        else (f.get("shipment_status") or f.get("status") or "Unknown")
        for f in fuls
    ])) if fuls else ""

    total_refund = 0.0
    for r in (o.get("refunds") or []):
        for t in (r.get("transactions") or []):
            try: total_refund += float(t.get("amount") or 0)
            except (TypeError, ValueError): pass
    refunded_at = None
    rdates = sorted([r.get("created_at") for r in (o.get("refunds") or []) if r.get("created_at")])
    if rdates: refunded_at = rdates[-1]

    ship = o.get("shipping_address") or {}
    tracking_numbers = (latest or {}).get("tracking_numbers") or []
    tracking_status = (latest or {}).get("shipment_status") or (latest or {}).get("status")

    return {
        "order_id": str(o.get("id")),
        "customer_name": customer_name,
        "email": o.get("email"),
        "phone": o.get("phone") or ship.get("phone"),
        "garments_sent": garments_sent,
        "line_skus": line_skus,
        "order_date": fmt_date(o.get("processed_at") or o.get("created_at")),
        "order_placed_date": fmt_date(o.get("created_at")),
        "fulfillment": o.get("fulfillment_status"),
        "tracking_id": (latest or {}).get("tracking_number") or (tracking_numbers[0] if tracking_numbers else None),
        "tracking_status": tracking_status,
        "delivery_date": fmt_date((latest or {}).get("updated_at") or (latest or {}).get("created_at"))
                         if (latest or {}).get("shipment_status") == "delivered" else None,
        "address": flatten_address(o.get("shipping_address") or o.get("billing_address")),
        "subtotal_price": num_or_none(o.get("subtotal_price")),
        "total_price": num_or_none(o.get("total_price")),
        "discount_total": num_or_none(o.get("total_discounts")),
        "discount_codes": ", ".join(d.get("code", "") for d in (o.get("discount_codes") or [])) or None,
        "tags": o.get("tags") or None,
        "note": o.get("note"),
        "financial_status": o.get("financial_status"),
        "customer_order_count": cust.get("orders_count"),
        "cancelled_at": o.get("cancelled_at"),
        "cancel_reason": o.get("cancel_reason"),
        "refunded_at": refunded_at,
        "refund_amount": total_refund if total_refund > 0 else None,
        "fulfillment_events": {"chain": chain} if chain else None,
        "synced_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }

def order_has_inf_tag(o):
    tags = [t.strip().upper() for t in str(o.get("tags") or "").split(",")]
    return any(t in tags for t in ORDER_TAGS)

# ── Shopify + Supabase IO ─────────────────────────────────────────────────────
def shopify_get(url):
    for attempt in range(6):
        try:
            r = requests.get(url, headers={"X-Shopify-Access-Token": SHOPIFY_TOKEN,
                                           "Content-Type": "application/json"}, timeout=60)
        except requests.RequestException as e:
            log(f"  [net-retry {attempt+1}/6] {type(e).__name__}"); time.sleep(min(60, 4 * 2 ** attempt)); continue
        if r.status_code == 429:
            time.sleep(2); continue
        return r
    return None

def parse_next_link(link_header):
    if not link_header: return None
    for part in link_header.split(","):
        if 'rel="next"' in part:
            m = re.search(r"<([^>]+)>", part)
            if m: return m.group(1)
    return None

def supabase_upsert(rows):
    if not rows: return 0
    url = f"{SB_URL}/rest/v1/shopify_orders?on_conflict=order_id"
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
               "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    r = requests.post(url, headers=headers, data=json.dumps(rows), timeout=60)
    if r.status_code not in (200, 201, 204):
        log(f"  [DB-FAIL] HTTP {r.status_code}: {scrub(r.text[:200])}"); return 0
    return len(rows)

def sync_single(order_id):
    clean = re.sub(r"\D", "", str(order_id))
    url = f"https://{STORE_DOMAIN}/admin/api/{API_VERSION}/orders/{clean}.json?fields={ORDER_FIELDS}"
    r = shopify_get(url)
    if not r or r.status_code != 200:
        log(f"[single] fetch failed for {order_id}: HTTP {getattr(r,'status_code','?')}"); return
    order = (r.json() or {}).get("order")
    if not order:
        log(f"[single] order {order_id} not found"); return
    if not order_has_inf_tag(order):
        log(f"[single] order {order_id} not tagged {ORDER_TAGS} — skipped"); return
    n = supabase_upsert([map_order(order)])
    log(f"[single] order {order_id} upserted={n}")

def run_once(days_back):
    if not (SHOPIFY_TOKEN and SB_URL and SB_KEY):
        log("[fatal] missing SHOPIFY_ADMIN_TOKEN / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY"); return
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days_back)).isoformat()
    url = (f"https://{STORE_DOMAIN}/admin/api/{API_VERSION}/orders.json"
           f"?status=any&limit=250&updated_at_min={requests.utils.quote(since)}&fields={ORDER_FIELDS}")
    seen = matched = upserted = pages = 0
    while url and pages < MAX_PAGES:
        pages += 1
        r = shopify_get(url)
        if not r or r.status_code != 200:
            log(f"[shopify] HTTP {getattr(r,'status_code','?')}: {scrub((r.text[:300]) if r else 'no response')}"); break
        batch = (r.json() or {}).get("orders") or []
        seen += len(batch)
        inf = [o for o in batch if order_has_inf_tag(o)]
        matched += len(inf)
        if inf:
            upserted += supabase_upsert([map_order(o) for o in inf])
        url = parse_next_link(r.headers.get("Link")) or ""
    truncated = bool(url and pages >= MAX_PAGES)
    log(f"[done] seen={seen} matched={matched} upserted={upserted} pages={pages}"
        + (" (truncated — raise SHOPIFY_MAX_PAGES)" if truncated else ""))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="run a single pass and exit")
    ap.add_argument("--interval", type=int, default=10800, help="loop interval seconds (default 3h)")
    ap.add_argument("--days-back", type=int, default=DAYS_BACK, help="bulk window (days)")
    ap.add_argument("--order-id", type=str, default=None, help="backfill one order id and exit")
    args = ap.parse_args()

    log(f"store={STORE_DOMAIN} api={API_VERSION} tags={ORDER_TAGS} days_back={args.days_back} max_pages={MAX_PAGES}")
    if args.order_id:
        sync_single(args.order_id); return
    if args.once:
        run_once(args.days_back); return
    log(f"daemon mode — every {args.interval}s. Ctrl-C to stop.")
    while True:
        try:
            run_once(args.days_back)
        except Exception as e:
            log(f"[loop-error] {type(e).__name__}: {scrub(str(e))[:160]}")
        time.sleep(args.interval)

if __name__ == "__main__":
    main()
