// One-shot / local runner for the Meta Ads warehouse → meta_ads_cache sync.
// Same logic as /api/cron/warehouse-sync, runnable from a dev machine when the
// cache needs an immediate refresh: `node scripts/sync-warehouse-cache.mjs`.
// Reads env from apps/web/.env.local.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const WH_URL = env.META_ADS_SUPABASE_URL;
const WH_KEY = env.META_ADS_SUPABASE_SERVICE_KEY;
const APP_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const APP_KEY = env.SUPABASE_SERVICE_KEY;
if (!WH_URL || !WH_KEY || !APP_URL || !APP_KEY) {
  console.error("missing env"); process.exit(1);
}

const whHeaders = { apikey: WH_KEY, Authorization: `Bearer ${WH_KEY}` };
const appHeaders = {
  apikey: APP_KEY,
  Authorization: `Bearer ${APP_KEY}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates",
};

const AE_COLS = [
  "ad_id","ad_name","ad_created","ad_status","category",
  "f1_pass","f2_pass","f3_pass","f4_pass",
  "impressions","amount_spent","roas_ma","ftewv_count","cost_per_ftewv",
  "ncp_count","cost_per_ncp","conv_value","purchases",
  "shopify_orders","shopify_sales","preview_link","ad_link",
];
const TOKEN_RE = /([A-Z]+-\d+-P\d+)/i;
const num = (v) => (Number(v) || 0);
const numOrNull = (v) => (v == null || v === "" ? null : Number(v) || 0);

async function pageAll(url) {
  const out = [];
  let offset = 0;
  const PAGE = 1000;
  while (offset < 20000) {
    const r = await fetch(`${url}&limit=${PAGE}&offset=${offset}`, { headers: whHeaders });
    if (!r.ok) { console.error("warehouse", r.status, await r.text()); break; }
    const j = await r.json();
    out.push(...j);
    if (j.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

const rows = await pageAll(
  `${WH_URL}/rest/v1/ae_table_view?select=${AE_COLS.join(",")}&order=amount_spent.desc.nullslast`,
);
console.log("ae_table_view rows:", rows.length);

const byToken = new Map();
for (const raw of rows) {
  const m = String(raw.ad_name ?? "").match(TOKEN_RE);
  if (!m) continue;
  const token = m[1].toUpperCase();
  const ad = {
    adId: String(raw.ad_id ?? ""),
    adName: String(raw.ad_name ?? ""),
    adCreated: raw.ad_created ? String(raw.ad_created) : null,
    adStatus: String(raw.ad_status ?? "").trim(),
    category: String(raw.category ?? "").trim(),
    f1Pass: Boolean(raw.f1_pass), f2Pass: Boolean(raw.f2_pass),
    f3Pass: Boolean(raw.f3_pass), f4Pass: Boolean(raw.f4_pass),
    impressions: num(raw.impressions), amountSpent: num(raw.amount_spent),
    roasMa: num(raw.roas_ma), ftewvCount: num(raw.ftewv_count),
    costPerFtewv: numOrNull(raw.cost_per_ftewv), ncpCount: num(raw.ncp_count),
    costPerNcp: numOrNull(raw.cost_per_ncp), convValue: num(raw.conv_value),
    purchases: num(raw.purchases), shopifyOrders: num(raw.shopify_orders),
    shopifySales: num(raw.shopify_sales),
    previewLink: raw.preview_link ? String(raw.preview_link) : null,
    adLink: raw.ad_link ? String(raw.ad_link) : null,
    thumbnailUrl: null, imageUrl: null,
  };
  (byToken.get(token) ?? byToken.set(token, []).get(token)).push(ad);
}
console.log("tokens:", byToken.size);

// Thumbnails for all matched ad ids, chunked.
const allIds = [...byToken.values()].flat().map((a) => a.adId).filter(Boolean);
const thumbs = new Map();
for (let i = 0; i < allIds.length; i += 150) {
  const chunk = allIds.slice(i, i + 150);
  const r = await fetch(
    `${WH_URL}/rest/v1/ad_thumbnails?select=ad_id,thumbnail_url,image_url&ad_id=in.(${chunk.map((x) => `"${x}"`).join(",")})`,
    { headers: whHeaders },
  );
  if (!r.ok) continue;
  for (const t of await r.json()) {
    thumbs.set(String(t.ad_id), {
      thumb: t.thumbnail_url ?? null,
      image: t.image_url ?? null,
    });
  }
}
console.log("thumbnails:", thumbs.size);

const payload = [];
for (const [token, ads] of byToken) {
  ads.sort((a, b) => b.amountSpent - a.amountSpent);
  for (const ad of ads) {
    const t = thumbs.get(ad.adId);
    if (t) { ad.thumbnailUrl = t.thumb; ad.imageUrl = t.image; }
  }
  payload.push({ token, ads, refreshed_at: new Date().toISOString() });
}

// Upsert in batches, then prune tokens that vanished from the warehouse.
for (let i = 0; i < payload.length; i += 200) {
  const r = await fetch(`${APP_URL}/rest/v1/meta_ads_cache?on_conflict=token`, {
    method: "POST",
    headers: appHeaders,
    body: JSON.stringify(payload.slice(i, i + 200)),
  });
  if (!r.ok) { console.error("upsert", r.status, await r.text()); process.exit(1); }
}
const keep = payload.map((p) => `"${p.token}"`).join(",");
if (payload.length > 0) {
  await fetch(`${APP_URL}/rest/v1/meta_ads_cache?token=not.in.(${keep})`, {
    method: "DELETE",
    headers: appHeaders,
  });
}
console.log("synced", payload.length, "tokens into meta_ads_cache");
