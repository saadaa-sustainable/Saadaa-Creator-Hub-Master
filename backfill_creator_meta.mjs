#!/usr/bin/env node
/**
 * backfill_creator_meta.mjs — re-fetch the creators that have NO stored profile
 * image via Meta business_discovery (the SAME call the Reach Out batch fetch
 * uses, 50 handles per batch POST), and map the full creator data
 * (profile_pic, followers, name, profile_id, er, avg_likes) into the creators
 * table. READ-ONLY on Meta. Reads creds from apps/web/.env.local.
 *
 * Run:  node backfill_creator_meta.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENV = {};
try {
  for (const line of readFileSync(join(ROOT, "apps/web/.env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    ENV[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
} catch (e) { console.error("could not read apps/web/.env.local", e.message); process.exit(1); }

const env = (k, ...alt) => process.env[k] || ENV[k] || alt.map((a) => process.env[a] || ENV[a]).find(Boolean);
const TOKEN = env("META_GRAPH_API_TOKEN");
const OWN_ID = env("META_IG_BUSINESS_ID", "ID");
const SB_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SB_KEY = env("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
if (!TOKEN || !OWN_ID) { console.error("Missing META_GRAPH_API_TOKEN / META_IG_BUSINESS_ID"); process.exit(1); }
if (!SB_URL || !SB_KEY) { console.error("Missing Supabase creds"); process.exit(1); }

const GRAPH = "v21.0";
const BATCH = 50;
const MEDIA_LIMIT = 6;
const PROFILE_FIELDS = "ig_id,username,name,biography,followers_count,profile_picture_url";
const sb = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (h) => h.trim().replace(/^@/, "").toLowerCase();
const field = (h) => `business_discovery.username(${clean(h)}){${PROFILE_FIELDS},media.limit(${MEDIA_LIMIT}){like_count,comments_count}}`;

function usageMax(raw) {
  if (!raw) return 0;
  try { return Math.max(0, ...Object.values(JSON.parse(raw)).map(Number).filter((n) => !Number.isNaN(n))); } catch { return 0; }
}
function buildNode(bd, fallback) {
  if (!bd || bd.ig_id == null) return null;
  const followers = typeof bd.followers_count === "number" ? bd.followers_count : null;
  const media = bd.media?.data ?? [];
  let avg_likes = null, er = null;
  if (media.length) {
    const ml = media.reduce((a, m) => a + Number(m.like_count ?? 0), 0) / media.length;
    const mc = media.reduce((a, m) => a + Number(m.comments_count ?? 0), 0) / media.length;
    avg_likes = Math.round(ml);
    if (followers > 0) er = Number((((ml + mc) / followers) * 100).toFixed(2));
  }
  return {
    profile_id: bd.ig_id != null ? String(bd.ig_id) : null,
    name: typeof bd.name === "string" && bd.name ? bd.name : null,
    followers, avg_likes, er,
    profile_pic: typeof bd.profile_picture_url === "string" ? bd.profile_picture_url : null,
  };
}

async function metaBatch(handles) {
  const sub = handles.map((h) => ({ method: "GET", relative_url: `${GRAPH}/${OWN_ID}?fields=${encodeURIComponent(field(h))}` }));
  const form = new URLSearchParams();
  form.set("access_token", TOKEN);
  form.set("batch", JSON.stringify(sub));
  const res = await fetch(`https://graph.facebook.com/${GRAPH}/`, { method: "POST", body: form });
  const usage = usageMax(res.headers.get("x-app-usage"));
  const text = await res.text();
  if (!res.ok) { console.error(`  batch HTTP ${res.status}: ${text.slice(0, 160)}`); return { nodes: handles.map(() => null), usage }; }
  let arr;
  try { arr = JSON.parse(text); } catch { return { nodes: handles.map(() => null), usage }; }
  const nodes = handles.map((h, i) => {
    const r = arr[i];
    if (!r || !r.body) return null;
    try { const b = JSON.parse(r.body); return b.error ? null : buildNode(b.business_discovery, clean(h)); } catch { return null; }
  });
  return { nodes, usage };
}

// ── main ──────────────────────────────────────────────────────────
const r = await sb("creators?select=inf_id,username,inf_name,profile_id&profile_pic=is.null&limit=100000");
const creators = (await r.json()).filter((c) => (c.username || "").trim());
console.log(`creators with NULL profile_pic + a username: ${creators.length}`);

let found = 0, updated = 0, notFound = 0;
for (let i = 0; i < creators.length; i += BATCH) {
  const slice = creators.slice(i, i + BATCH);
  const { nodes, usage } = await metaBatch(slice.map((c) => c.username));
  for (let j = 0; j < slice.length; j++) {
    const c = slice[j], n = nodes[j];
    if (!n || !n.profile_pic) { notFound++; continue; }
    found++;
    const patch = { profile_pic: n.profile_pic };
    if (n.followers != null) patch.followers = n.followers;
    if (n.er != null) patch.er = n.er;
    if (n.avg_likes != null) patch.avg_likes = n.avg_likes;
    if (n.name && !c.inf_name) patch.inf_name = n.name;          // fill only if blank
    if (n.profile_id && !c.profile_id) patch.profile_id = n.profile_id;
    const up = await sb(`creators?inf_id=eq.${encodeURIComponent(c.inf_id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
    if (up.ok) updated++; else console.error(`  PATCH ${c.inf_id} failed: ${up.status}`);
  }
  console.log(`batch ${i / BATCH + 1}/${Math.ceil(creators.length / BATCH)} · usage ${usage}% · found ${found} · updated ${updated}`);
  // rate gate: cool down hard if X-App-Usage climbs; otherwise a light pause.
  await sleep(usage >= 75 ? 300_000 : 1500);
}
console.log(`\nDONE — scanned ${creators.length}, found+mapped ${updated}, not found / personal ${notFound}`);
