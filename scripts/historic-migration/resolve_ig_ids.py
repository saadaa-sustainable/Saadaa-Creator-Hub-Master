#!/usr/bin/env python3
"""
Free Instagram numeric-id resolver for historic_creator_data.profile_id.

Resolves each distinct IG handle (where profile_id IS NULL) via Instagram's
public web_profile_info endpoint — no Apify, no cost. Throttled + resumable:
progress is written to the DB row-by-row AND cached to /tmp/ig_id_cache.json,
so if IG rate-limits the IP you can just re-run and it continues.

Usage:
  python3 /tmp/resolve_ig_ids.py
Env knobs:
  PACE=1.2     seconds base sleep between IG calls (jitter added)
  MAX_BLOCKS=12 consecutive blocks before graceful stop
"""
import json, os, random, re, sys, time, urllib.request, urllib.error

SUPABASE_URL = "https://xynyvbagcudjrzklwnqp.supabase.co"
ENV_FILE = os.path.expanduser(
    "~/Documents/Influencer Project/New Influencer Project/apps/web/.env.local")
TABLE = "historic_creator_data"
CACHE_FILE = "/tmp/ig_id_cache.json"
IG_APP_ID = "936619743392459"
PACE = float(os.environ.get("PACE", "25"))            # base sleep between calls (slow-trickle)
BLOCK_COOLDOWN = int(os.environ.get("BLOCK_COOLDOWN", "900"))  # wait when IG rate-limits the IP
BLOCK_RETRIES = int(os.environ.get("BLOCK_RETRIES", "6"))      # max cooldown-retries per handle

UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
]

HANDLE_RE = re.compile(r'instagram\.com/([^/?#]+)', re.IGNORECASE)

def load_key():
    for n in ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"):
        if os.environ.get(n):
            return os.environ[n]
    with open(ENV_FILE) as f:
        for line in f:
            for p in ("SUPABASE_SERVICE_ROLE_KEY=", "SUPABASE_SERVICE_KEY="):
                if line.strip().startswith(p):
                    return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("ERROR: Supabase service key not found")

SVC = load_key()
SB_HEADERS = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json"}

def norm_handle(username, ig_handle):
    h = None
    if ig_handle:
        m = HANDLE_RE.search(ig_handle)
        if m:
            h = m.group(1)
    if not h:
        h = username
    if not h:
        return None
    h = h.strip().strip("/").strip().lower()
    return h or None

def sb_get(path):
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

def sb_patch_ids(row_ids, ig_id):
    """Set profile_id=ig_id for the given row ids (chunked to keep URL short)."""
    for i in range(0, len(row_ids), 100):
        chunk = row_ids[i:i+100]
        ids = ",".join(str(x) for x in chunk)
        url = f"{SUPABASE_URL}/rest/v1/{TABLE}?id=in.({ids})"
        body = json.dumps({"profile_id": ig_id}).encode()
        req = urllib.request.Request(url, data=body, method="PATCH",
                                     headers={**SB_HEADERS, "Prefer": "return=minimal"})
        urllib.request.urlopen(req).read()

def fetch_pending_rows():
    """All rows with profile_id null: list of (id, username, ig_handle), paginated."""
    rows, offset, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{TABLE}?profile_id=is.null&select=id,username,ig_handle"
            f"&order=id.asc&limit={page}&offset={offset}", headers=SB_HEADERS)
        with urllib.request.urlopen(req) as r:
            batch = json.loads(r.read().decode())
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows

def resolve_ig(handle):
    """Return numeric id str, or None (not found), or 'BLOCK' (rate-limited)."""
    url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={handle}"
    req = urllib.request.Request(url, headers={
        "x-ig-app-id": IG_APP_ID,
        "User-Agent": random.choice(UAS),
        "Accept": "*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read().decode())
        return data.get("data", {}).get("user", {}).get("id")
    except urllib.error.HTTPError as e:
        if e.code in (401, 429):
            return "BLOCK"
        return None        # 404 / 400 = bad/missing handle
    except Exception:
        return None

def load_cache():
    try:
        with open(CACHE_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {"resolved": {}, "failed": {}}

def save_cache(c):
    with open(CACHE_FILE, "w") as f:
        json.dump(c, f)

def main():
    print("Fetching pending rows from Supabase …", flush=True)
    rows = fetch_pending_rows()
    print(f"  {len(rows)} rows with null profile_id", flush=True)

    handle_rows = {}
    for r in rows:
        h = norm_handle(r.get("username"), r.get("ig_handle"))
        if h:
            handle_rows.setdefault(h, []).append(r["id"])
    print(f"  {len(handle_rows)} distinct handles to resolve", flush=True)

    cache = load_cache()
    done = set(cache["resolved"]) | set(cache["failed"])
    todo = [h for h in handle_rows if h not in done]
    limit = int(os.environ.get("LIMIT", "0"))
    if limit:
        todo = todo[:limit]
    print(f"  {len(todo)} remaining (after cache), {len(done)} cached\n", flush=True)

    ok, fail, i = 0, 0, 0
    total = len(todo)
    block_tries = {}
    while i < total:
        h = todo[i]
        res = resolve_ig(h)
        if res == "BLOCK":
            blk = block_tries.get(h, 0) + 1
            block_tries[h] = blk
            if blk > BLOCK_RETRIES:
                cache["failed"][h] = "block"; fail += 1; i += 1
                save_cache(cache)
                continue
            print(f"  [{i+1}/{total}] BLOCK on '{h}' (try {blk}/{BLOCK_RETRIES}) "
                  f"— cooldown {BLOCK_COOLDOWN}s", flush=True)
            save_cache(cache)
            time.sleep(BLOCK_COOLDOWN)
            continue                      # retry SAME handle, don't advance
        if res:
            cache["resolved"][h] = res
            try:
                sb_patch_ids(handle_rows[h], res)
            except Exception as e:
                print(f"  patch error for {h}: {e}", flush=True)
            ok += 1
        else:
            cache["failed"][h] = 1
            fail += 1
        i += 1
        if i % 25 == 0:
            save_cache(cache)
            print(f"  [{i}/{total}] ok={ok} fail={fail} "
                  f"resolved_total={len(cache['resolved'])}", flush=True)
        time.sleep(PACE + random.uniform(0.5, 3.0))

    save_cache(cache)
    print(f"\nRun done. resolved this run: ok={ok} fail={fail}. "
          f"cache total: resolved={len(cache['resolved'])} failed={len(cache['failed'])}",
          flush=True)

if __name__ == "__main__":
    main()
