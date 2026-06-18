#!/usr/bin/env python3
"""
Bulk-resolve historic_creator_data.profile_id (legacy IG numeric id) via Apify
instagram-profile-scraper, rotating across MULTIPLE Apify accounts/tokens.

Each free Apify account has ~$5 (~1,920 profiles). Tokens are consumed in order:
the script uses token #1 until that account's credit is exhausted (Apify returns
a quota/payment error), then rotates to token #2, etc. Self-balances a partially
used account. Resumable: work-list = rows where profile_id IS NULL.

Tokens: put one per line in /tmp/apify_tokens.txt (blank lines / # comments ignored).
NEVER printed or committed.

  python3 /tmp/apify_resolve_ids.py
Env: BATCH=50  ACTOR=apify~instagram-profile-scraper
"""
import json, os, re, sys, time, urllib.request, urllib.error

SUPABASE_URL = "https://xynyvbagcudjrzklwnqp.supabase.co"
ENV_FILE = os.path.expanduser(
    "~/Documents/Influencer Project/New Influencer Project/apps/web/.env.local")
TOKENS_FILE = "/tmp/apify_tokens.txt"
TABLE = "historic_creator_data"
ACTOR = os.environ.get("ACTOR", "apify~instagram-profile-scraper")
BATCH = int(os.environ.get("BATCH", "50"))
HANDLE_RE = re.compile(r'instagram\.com/([^/?#]+)', re.IGNORECASE)
# IG path keywords that are NOT usernames (reel/post/direct URLs) — reject, fall back to username.
# Without this, a reel/post LINK in ig_handle resolves the keyword to a real account
# (@reel=368393670, @direct=3107544244) and poisons many rows onto one wrong id.
RESERVED = {"reel", "reels", "p", "tv", "stories", "direct", "explore", "accounts",
            "about", "web", "s", "ar", "challenge", "locations", "directory"}

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

def load_tokens():
    """Read Apify tokens from .env.local: APIFY_TOKEN_1..N (any APIFY_TOKEN* key),
    or a comma-separated APIFY_TOKENS=. Ordered by key name. Never printed in full."""
    toks, kv = [], {}
    csv = os.environ.get("APIFY_TOKENS")
    if csv:
        toks += [t.strip() for t in csv.split(",") if t.strip()]
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip(); v = v.strip().strip('"').strip("'")
                if k == "APIFY_TOKENS":
                    toks += [t.strip() for t in v.split(",") if t.strip()]
                elif k.startswith("APIFY_TOKEN") and v:
                    kv[k] = v
    except FileNotFoundError:
        pass
    for k in sorted(kv):
        toks.append(kv[k])
    seen, out = set(), []
    for t in toks:
        if t and t not in seen:
            seen.add(t); out.append(t)
    if not out:
        sys.exit("ERROR: no Apify tokens. Add APIFY_TOKEN_1..N (or APIFY_TOKENS=a,b,c) to "
                 f"{ENV_FILE}")
    masked = ", ".join(f"{t[:6]}…({len(t)})" for t in out)
    print(f"Loaded {len(out)} Apify token(s): {masked}", flush=True)
    return out

SVC = load_key()
SB = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json"}

def norm_handle(username, ig_handle):
    h = None
    if ig_handle:
        m = HANDLE_RE.search(ig_handle)
        if m and m.group(1).lower() not in RESERVED:   # skip reel/p/direct/etc URLs
            h = m.group(1)
    if not h:
        h = username
    if not h:
        return None
    h = h.strip().strip("/").strip().lower()
    return h or None

def fetch_pending():
    order = os.environ.get("ORDER", "asc")      # 'desc' -> live/recent handles first
    rows, offset, page = [], 0, 1000
    while True:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{TABLE}?profile_id=is.null&select=id,username,ig_handle"
            f"&order=id.{order}&limit={page}&offset={offset}", headers=SB)
        with urllib.request.urlopen(req) as r:
            batch = json.loads(r.read().decode())
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows

def sb_patch(row_ids, ig_id):
    for i in range(0, len(row_ids), 100):
        ids = ",".join(str(x) for x in row_ids[i:i+100])
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{TABLE}?id=in.({ids})",
            data=json.dumps({"profile_id": ig_id}).encode(), method="PATCH",
            headers={**SB, "Prefer": "return=minimal"})
        urllib.request.urlopen(req).read()

def apify_run(token, handles):
    """Return (status, items_or_errtext). status: 'ok' | 'quota' | 'error'."""
    url = (f"https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items"
           f"?token={token}&timeout=300")
    body = json.dumps({"usernames": handles}).encode()  # one key only — avoid double-charge
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=320) as r:
            return "ok", json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        txt = e.read().decode()[:300]
        low = txt.lower()
        if e.code in (402, 403) or "exceed" in low or "limit" in low or "usage" in low \
           or "monthly" in low or "insufficient" in low:
            return "quota", f"HTTP {e.code}: {txt}"
        return "error", f"HTTP {e.code}: {txt}"
    except Exception as ex:
        return "error", str(ex)

def main():
    tokens = load_tokens()
    pin = os.environ.get("TOKEN_PIN")          # 1-based index -> use only that account
    if pin:
        tokens = [tokens[int(pin) - 1]]
        print(f"  pinned to token #{pin}", flush=True)
    print("Fetching pending rows …", flush=True)
    rows = fetch_pending()
    handle_rows = {}
    for r in rows:
        h = norm_handle(r.get("username"), r.get("ig_handle"))
        if h:
            handle_rows.setdefault(h, []).append(r["id"])
    handles = list(handle_rows.keys())
    shard = os.environ.get("SHARD")            # "i/n" -> process handles where idx%n==i
    if shard:
        si, sn = (int(x) for x in shard.split("/"))
        handles = [h for idx, h in enumerate(handles) if idx % sn == si]
        print(f"  shard {shard}: {len(handles)} handles this instance", flush=True)
    lim = int(os.environ.get("LIMIT", "0"))
    if lim:
        handles = handles[:lim]
    print(f"  {len(rows)} null rows, {len(handles)} distinct handles to resolve\n", flush=True)

    tok_i, ok, miss, i = 0, 0, 0, 0
    err_tries = {}
    n = len(handles)
    while i < n:
        if tok_i >= len(tokens):
            print(f"\nAll {len(tokens)} accounts exhausted. {n - i} handles still unresolved "
                  f"(re-run after topping up / adding tokens).", flush=True)
            break
        batch = handles[i:i+BATCH]
        status, payload = apify_run(tokens[tok_i], batch)
        if status == "quota":
            print(f"  account #{tok_i+1} exhausted -> rotating. ({payload[:80]})", flush=True)
            tok_i += 1
            continue                       # retry SAME batch on next token
        if status == "error":
            err_tries[i] = err_tries.get(i, 0) + 1
            if err_tries[i] <= 4:
                print(f"  transient error (acct#{tok_i+1}) rows {i}-{i+len(batch)}: "
                      f"{payload[:80]} — retry {err_tries[i]}/4", flush=True)
                time.sleep(4 * err_tries[i])
                continue                   # retry SAME batch, same token
            print(f"  giving up rows {i}-{i+len(batch)} after 4 retries (left NULL)", flush=True)
            i += BATCH
            continue
        # ok: map username->id
        idmap = {}
        for item in payload:
            u = (item.get("username") or "").lower()
            iid = item.get("id")
            if u and iid:
                idmap[u] = str(iid)
        for h in batch:
            if h in idmap:
                try:
                    sb_patch(handle_rows[h], idmap[h])
                    ok += 1
                except Exception as e:
                    print(f"  patch error {h}: {e}", flush=True)
            else:
                miss += 1
        i += BATCH
        print(f"  [{min(i,n)}/{n}] acct#{tok_i+1} ok={ok} miss={miss}", flush=True)

    print(f"\nDone. resolved={ok} missed(private/notfound)={miss}", flush=True)

if __name__ == "__main__":
    main()
