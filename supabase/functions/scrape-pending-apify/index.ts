// supabase/functions/scrape-pending-apify/index.ts
//
// Apify scraper — runs on a 3-hour Supabase Cron schedule.
//
// Reads `instagram_cache` rows with status='pending' (queued by lookupCreator
// when no cache hit), calls Apify, writes results back. Errors land in
// `system_errors` (type='apify_fail') for Error Portal.
//
// Verbose logging on every step so logs explain exactly what happened.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN');
const APIFY_ACTOR_ID = Deno.env.get('APIFY_ACTOR_ID') ?? 'apify/instagram-profile-scraper';
const MAX_ATTEMPTS = Number(Deno.env.get('APIFY_MAX_ATTEMPTS') ?? '3');
const BATCH_SIZE = Number(Deno.env.get('APIFY_BATCH_SIZE') ?? '20');
// Meta Ads warehouse (separate Supabase project) — optional. When its secrets
// are set on this function, the payment-recompute pass can auto-clear
// posted_but_not_tested for ads that have since appeared in the warehouse.
// Absent → falls back to ads_results-only "tested" detection.
const META_ADS_SUPABASE_URL = Deno.env.get('META_ADS_SUPABASE_URL');
const META_ADS_SUPABASE_SERVICE_KEY = Deno.env.get('META_ADS_SUPABASE_SERVICE_KEY');

interface ApifyProfile {
  username?: string;
  inputUrl?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  verified?: boolean;
  private?: boolean;
  profilePicUrl?: string;
  profilePicUrlHD?: string;
  externalUrl?: string;
  latestPosts?: { likesCount?: number; commentsCount?: number }[];
}

function tierFor(followers: number | null | undefined): string | null {
  if (followers == null) return null;
  if (followers < 10_000) return 'Nano';
  if (followers < 50_000) return 'Micro';
  if (followers < 300_000) return 'Mid tier';
  if (followers < 1_000_000) return 'Macro';
  return 'Mega';
}

// ── Instagram shortcode → date decode (no API; bitshift formula) ──────────
// Direct port of legacy InfluencerBackend.js#shortcodeToDate.
// Formula: timestamp_ms = (media_id >> 23) + 1314220021721
const SHORTCODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INSTAGRAM_EPOCH = 1_314_220_021_721n;

function extractShortcode(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|tv|reels)\/([^/?#]+)/i);
  return m ? m[1] : null;
}

function formatIstDate(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

function shortcodeToIsoDate(shortcode: string): string | null {
  if (!shortcode) return null;
  let id = 0n;
  for (const ch of shortcode) {
    const idx = SHORTCODE_ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    id = id * 64n + BigInt(idx);
  }
  try {
    const tsMs = (id >> 23n) + INSTAGRAM_EPOCH;
    const d = new Date(Number(tsMs));
    if (Number.isNaN(d.getTime())) return null;
    if (d.getFullYear() < 2010 || d.getFullYear() > 2099) return null;
    return formatIstDate(d); // IST not UTC — matches Instagram display for IN operators
  } catch {
    return null;
  }
}

function todayIso(): string {
  return formatIstDate(new Date());
}

// ── Backfill missing post_date on Posted/Delivered rows ───────────────────
// Mirrors legacy InfluencerBackend.js#backfillMissingPostDates but decodes
// the date from the Instagram shortcode first (instant, no API). Falls back
// to onboard_date, then today. Runs at the end of every apify cron tick.
async function backfillPostDates(
  supabase: ReturnType<typeof createClient>,
): Promise<{ scanned: number; updated: number; decoded: number; fallback: number }> {
  const { data, error } = await supabase
    .from('posts')
    .select('post_id, post_link, onboard_date')
    .in('workflow_status', ['Posted', 'Delivered'])
    .is('post_date', null)
    .limit(500);

  if (error) {
    console.error(`[postdate-backfill] select failed: ${error.message}`);
    return { scanned: 0, updated: 0, decoded: 0, fallback: 0 };
  }

  const rows = data ?? [];
  console.log(`[postdate-backfill] scanned=${rows.length}`);

  let updated = 0;
  let decoded = 0;
  let fallback = 0;

  for (const row of rows as Array<{
    post_id: string;
    post_link: string | null;
    onboard_date: string | null;
  }>) {
    const sc = extractShortcode(row.post_link);
    let resolved = sc ? shortcodeToIsoDate(sc) : null;
    let source: 'shortcode' | 'onboard' | 'today' = 'shortcode';
    if (!resolved) {
      resolved = row.onboard_date
        ? String(row.onboard_date).slice(0, 10)
        : todayIso();
      source = row.onboard_date ? 'onboard' : 'today';
    }

    const { error: upErr } = await supabase
      .from('posts')
      .update({ post_date: resolved })
      .eq('post_id', row.post_id);

    if (upErr) {
      console.error(`[postdate-backfill] ${row.post_id} update failed: ${upErr.message}`);
      continue;
    }

    if (source === 'shortcode') decoded++;
    else fallback++;
    updated++;
    console.log(
      `[postdate-backfill] ${row.post_id} → ${resolved} (source=${source})`,
    );
  }

  return { scanned: rows.length, updated, decoded, fallback };
}

function extractUsernameFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/instagram\.com\/(?:@)?([A-Za-z0-9._]+)/i);
  return m ? m[1].toLowerCase() : null;
}

async function callApify(
  usernames: string[],
): Promise<{ map: Record<string, ApifyProfile>; rawCount: number; sample: unknown }> {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not set');

  // Send both shapes — different actor versions accept different input keys.
  const body = {
    usernames,
    directUrls: usernames.map((u) => `https://www.instagram.com/${u}/`),
    resultsType: 'details',
    resultsLimit: 1,
    addParentData: false,
  };

  console.log(`[apify] POST actor=${APIFY_ACTOR_ID} body=${JSON.stringify(body)}`);

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!runRes.ok) {
    const txt = await runRes.text().catch(() => '');
    throw new Error(`Apify ${runRes.status}: ${txt.slice(0, 500)}`);
  }
  const items = (await runRes.json()) as ApifyProfile[];

  console.log(`[apify] returned ${items.length} items`);
  const sample = items.length > 0 ? items[0] : null;
  if (items.length > 0) {
    console.log(`[apify] first item keys=${JSON.stringify(Object.keys(items[0]))}`);
    console.log(`[apify] first item sample=${JSON.stringify(items[0]).slice(0, 800)}`);
  }

  const map: Record<string, ApifyProfile> = {};
  for (const it of items) {
    const candidates: (string | null | undefined)[] = [
      it?.username,
      extractUsernameFromUrl(it?.inputUrl),
      extractUsernameFromUrl((it as Record<string, unknown>)?.url as string | undefined),
    ];
    for (const c of candidates) {
      if (c && typeof c === 'string') map[c.toLowerCase()] = it;
    }
  }
  console.log(`[apify] mapped usernames=${JSON.stringify(Object.keys(map))}`);
  return { map, rawCount: items.length, sample };
}

function avgLikesAndEr(profile: ApifyProfile): { avgLikes: number | null; er: number | null } {
  const posts = profile.latestPosts ?? [];
  if (posts.length === 0 || !profile.followersCount) return { avgLikes: null, er: null };
  const likes = posts.reduce((s, p) => s + (p.likesCount ?? 0), 0);
  const comments = posts.reduce((s, p) => s + (p.commentsCount ?? 0), 0);
  const avgLikes = likes / posts.length;
  const er = ((avgLikes + comments / posts.length) / profile.followersCount) * 100;
  return { avgLikes: Math.round(avgLikes), er: Number(er.toFixed(4)) };
}

// ── Persist avatar to Supabase Storage ─────────────────────────────────────
// Instagram profile-pic URLs are signed and expire within days, which silently
// breaks avatars across the app. Download the fresh image and store a permanent
// copy in the public `avatars` bucket; return its stable public URL. Returns
// null on any failure so the caller can fall back to the raw IG URL.
async function persistAvatar(
  supabase: ReturnType<typeof createClient>,
  username: string,
  srcUrl: string | null,
): Promise<string | null> {
  if (!srcUrl) return null;
  try {
    const res = await fetch(srcUrl);
    if (!res.ok) {
      console.error(`[avatar] fetch ${username} -> HTTP ${res.status}`);
      return null;
    }
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : 'jpg';
    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = `${username.toLowerCase()}.${ext}`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType, upsert: true });
    if (error) {
      console.error(`[avatar] upload ${username} failed: ${error.message}`);
      return null;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = data?.publicUrl ?? null;
    if (url) console.log(`[avatar] stored ${username}`);
    return url;
  } catch (e) {
    console.error(
      `[avatar] ${username} exception: ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }
}

// ── Payment-state reconciliation helper ───────────────────────────────────
// Mirrors the new-stack `recomputePaymentStates` server action; ported inline
// because Deno edge functions cannot import from apps/web.
//
// 1. status='Not Due' AND due_date ≤ today  →  status='Due' (mirror on posts).
// 2. status≠'Done' AND due_date IS NOT NULL AND estimated_payable_date IS NULL
//    →  set estimated_payable_date = nextPayableCycleDate(due_date).
const PAYABLE_CYCLE_DAYS_EDGE = [15, 30];

function nextPayableCycleDateEdge(due: string | null | undefined): string | null {
  if (!due) return null;
  const m = String(due).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(d);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (const cycle of PAYABLE_CYCLE_DAYS_EDGE) {
    if (day <= cycle) {
      const clamped = Math.min(cycle, lastDay);
      return new Date(Date.UTC(year, month, clamped)).toISOString().slice(0, 10);
    }
  }
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const lastNext = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const first = PAYABLE_CYCLE_DAYS_EDGE[0];
  return new Date(Date.UTC(nextYear, nextMonth, Math.min(first, lastNext)))
    .toISOString()
    .slice(0, 10);
}

// ── Meta Ads warehouse coverage (Deno port of lib/supabase/meta-ads.ts) ────
// Returns the Set of post_id_short values (uppercased) that appear in any
// IFAD-tagged ad_name in the warehouse `primary_table`. Empty Set when the
// warehouse secrets are not configured on this function.
async function fetchMetaAdsCoveredPostIds(): Promise<Set<string>> {
  if (!META_ADS_SUPABASE_URL || !META_ADS_SUPABASE_SERVICE_KEY) return new Set();
  try {
    const client = createClient(META_ADS_SUPABASE_URL, META_ADS_SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const POST_ID_REGEX = /([A-Z]+-\d+-P\d+)/i;
    const covered = new Set<string>();
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await client
        .from('primary_table')
        .select('ad_name')
        .ilike('ad_name', '%IFAD%')
        .range(offset, offset + PAGE - 1);
      if (error || !data?.length) break;
      for (const row of data) {
        const m = String((row as { ad_name?: string }).ad_name ?? '').match(POST_ID_REGEX);
        if (m) covered.add(m[1].toUpperCase());
      }
      if (data.length < PAGE) break;
      offset += PAGE;
      if (offset > 200_000) break;
    }
    return covered;
  } catch (e) {
    console.error(`[meta-ads] covered fetch failed: ${e instanceof Error ? e.message : e}`);
    return new Set();
  }
}

async function recomputePaymentStates(
  supabase: ReturnType<typeof createClient>,
): Promise<{
  scanned: number;
  flippedToDue: number;
  estPayableHealed: number;
  testedCleared: number;
}> {
  const today = formatIstDate(new Date());

  const { data: dueCandidates, error: dueErr } = await supabase
    .from('payments')
    .select('id, post_id, due_date')
    .eq('status', 'Not Due')
    .not('due_date', 'is', null)
    .lte('due_date', today);

  if (dueErr) {
    console.error(`[payment-recompute] select-due failed: ${dueErr.message}`);
    return { scanned: 0, flippedToDue: 0, estPayableHealed: 0, testedCleared: 0 };
  }

  const dueRows = (dueCandidates ?? []) as Array<{
    id: string;
    post_id: string;
    due_date: string;
  }>;
  let flipped = 0;
  for (const row of dueRows) {
    const { error: uErr } = await supabase
      .from('payments')
      .update({ status: 'Due' })
      .eq('id', row.id);
    if (uErr) {
      console.error(`[payment-recompute] ${row.id} flip failed: ${uErr.message}`);
      continue;
    }
    await supabase
      .from('posts')
      .update({ payment_status: 'Due' })
      .eq('post_id', row.post_id)
      .neq('payment_status', 'Done');
    flipped++;
  }

  const { data: needHeal } = await supabase
    .from('payments')
    .select('id, due_date')
    .neq('status', 'Done')
    .not('due_date', 'is', null)
    .is('estimated_payable_date', null);
  const healRows = (needHeal ?? []) as Array<{ id: string; due_date: string }>;
  let healed = 0;
  for (const row of healRows) {
    const est = nextPayableCycleDateEdge(row.due_date);
    if (!est) continue;
    const { error: uErr } = await supabase
      .from('payments')
      .update({ estimated_payable_date: est })
      .eq('id', row.id);
    if (!uErr) healed++;
  }

  // 3. Auto-clear posted_but_not_tested once the ad becomes tested. Mirrors
  //    the app's recomputePaymentStates pass: tested = ads_results set OR
  //    post_id_short present in the Meta Ads warehouse.
  let testedCleared = 0;
  const { data: flaggedPayments } = await supabase
    .from('payments')
    .select('id, post_id')
    .eq('posted_but_not_tested', true);
  const flagged = (flaggedPayments ?? []) as Array<{ id: string; post_id: string }>;
  if (flagged.length > 0) {
    const flaggedPostIds = [...new Set(flagged.map((p) => p.post_id))];
    const covered = await fetchMetaAdsCoveredPostIds();
    const { data: postRows } = await supabase
      .from('posts')
      .select('post_id, post_id_short, ads_results')
      .in('post_id', flaggedPostIds);
    const postById = new Map<
      string,
      { post_id_short: string | null; ads_results: string | null }
    >(
      ((postRows ?? []) as Array<{
        post_id: string;
        post_id_short: string | null;
        ads_results: string | null;
      }>).map((p) => [p.post_id, { post_id_short: p.post_id_short, ads_results: p.ads_results }]),
    );
    for (const pay of flagged) {
      const post = postById.get(pay.post_id);
      if (!post) continue;
      const classified = String(post.ads_results ?? '').trim() !== '';
      const inWarehouse = covered.has(String(post.post_id_short ?? '').trim().toUpperCase());
      if (classified || inWarehouse) {
        const { error: cErr } = await supabase
          .from('payments')
          .update({ posted_but_not_tested: false })
          .eq('id', pay.id);
        if (!cErr) testedCleared++;
      }
    }
  }

  return {
    scanned: dueRows.length + healRows.length,
    flippedToDue: flipped,
    estPayableHealed: healed,
    testedCleared,
  };
}

Deno.serve(async () => {
  console.log('[boot] handler invoked');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!APIFY_TOKEN) {
    console.error('[boot] APIFY_TOKEN not configured');
    return new Response(JSON.stringify({ ok: false, error: 'APIFY_TOKEN not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  // ── Re-queue stale 'auto' rows ──────────────────────────────────────────
  // Flip auto rows not refreshed in the last 3 hours back to 'pending' so
  // this same cron tick can pick them up. Oldest-first so no creator starves.
  // Cap at BATCH_SIZE to avoid a single cron tick overwhelming Apify.
  const staleThreshold = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  // Two separate queries avoid the .or('updated_at.is.null,...') PostgREST null bug.
  const [{ data: staleByTime, error: staleErrA }, { data: staleByNull, error: staleErrB }] =
    await Promise.all([
      supabase
        .from('instagram_cache')
        .select('username')
        .eq('status', 'auto')
        .lt('updated_at', staleThreshold)
        .order('updated_at', { ascending: true })
        .limit(BATCH_SIZE),
      supabase
        .from('instagram_cache')
        .select('username')
        .eq('status', 'auto')
        .is('updated_at', null)
        .limit(BATCH_SIZE),
    ]);

  const staleErr = staleErrA ?? staleErrB;
  const staleRows = [
    ...new Set([
      ...(staleByTime ?? []).map((r: { username: string }) => r.username),
      ...(staleByNull ?? []).map((r: { username: string }) => r.username),
    ]),
  ]
    .slice(0, BATCH_SIZE)
    .map((username) => ({ username }));

  if (staleErr) {
    console.error(`[requeue] stale select failed: ${staleErr.message}`);
  } else if ((staleRows ?? []).length > 0) {
    const staleUsernames = (staleRows ?? []).map((r: { username: string }) => r.username);
    const { error: requeueErr } = await supabase
      .from('instagram_cache')
      .update({ status: 'pending', attempts: 0 })
      .in('username', staleUsernames);
    if (requeueErr) {
      console.error(`[requeue] update failed: ${requeueErr.message}`);
    } else {
      console.log(`[requeue] flipped ${staleUsernames.length} stale rows to pending`);
    }
  }

  const { data: pending, error: selErr } = await supabase
    .from('instagram_cache')
    .select('username, attempts')
    .eq('status', 'pending')
    .order('username', { ascending: true })
    .limit(BATCH_SIZE);

  if (selErr) {
    console.error(`[select] ${selErr.message}`);
    return new Response(JSON.stringify({ ok: false, error: selErr.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  console.log(`[select] pending rows in DB=${(pending ?? []).length}`);

  const usernames = (pending ?? [])
    .filter((r: { attempts?: number | null }) => (r.attempts ?? 0) < MAX_ATTEMPTS)
    .map((r: { username: string }) => r.username.toLowerCase());

  console.log(`[batch] picked=${usernames.length} usernames=${JSON.stringify(usernames)}`);

  if (usernames.length === 0) {
    return new Response(JSON.stringify({ ok: true, drained: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  let scraped = 0;
  let failed = 0;
  let apifyMap: Record<string, ApifyProfile> = {};
  let apifyRawCount = 0;
  let apifySample: unknown = null;

  try {
    const r = await callApify(usernames);
    apifyMap = r.map;
    apifyRawCount = r.rawCount;
    apifySample = r.sample;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'apify call failed';
    console.error(`[apify] batch failed: ${msg}`);
    for (const username of usernames) {
      const row = (pending ?? []).find(
        (r: { username: string }) => r.username.toLowerCase() === username,
      );
      const nextAttempts = ((row as { attempts?: number | null })?.attempts ?? 0) + 1;
      const { error: upErr } = await supabase
        .from('instagram_cache')
        .update({ attempts: nextAttempts })
        .eq('username', username);
      if (upErr) console.error(`[update-attempts] ${username}: ${upErr.message}`);

      const { error: insErr } = await supabase.from('system_errors').insert({
        type: 'apify_fail',
        key: username,
        message: msg,
        source: 'scrape-pending-apify',
      });
      if (insErr) console.error(`[insert-error] ${username}: ${insErr.message}`);
    }
    return new Response(
      JSON.stringify({ ok: false, error: msg, queued: usernames.length }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  for (const username of usernames) {
    const p = apifyMap[username];
    if (!p) {
      const row = (pending ?? []).find(
        (r: { username: string }) => r.username.toLowerCase() === username,
      );
      const nextAttempts = ((row as { attempts?: number | null })?.attempts ?? 0) + 1;
      console.log(`[miss] ${username} attempts=${nextAttempts}`);

      const { error: upErr, count } = await supabase
        .from('instagram_cache')
        .update(
          {
            attempts: nextAttempts,
            status: nextAttempts >= MAX_ATTEMPTS ? 'not_found' : 'pending',
          },
          { count: 'exact' },
        )
        .eq('username', username);

      if (upErr) console.error(`[update-miss] ${username}: ${upErr.message}`);
      console.log(`[update-miss] ${username} rows-affected=${count}`);

      const { error: insErr } = await supabase.from('system_errors').insert({
        type: 'apify_fail',
        key: username,
        message: `Apify returned no profile data (attempt ${nextAttempts}/${MAX_ATTEMPTS}, total items=${apifyRawCount}, sample=${JSON.stringify(apifySample).slice(0, 200)})`,
        source: 'scrape-pending-apify',
      });
      if (insErr) console.error(`[insert-error] ${username}: ${insErr.message}`);

      failed++;
      continue;
    }

    const { avgLikes, er } = avgLikesAndEr(p);
    const now = new Date().toISOString();
    // Persist a permanent copy to Supabase Storage so the avatar doesn't break
    // when the Instagram signed URL expires. Fall back to the raw URL on failure.
    const rawPic = p.profilePicUrlHD ?? p.profilePicUrl ?? null;
    const storedPic = (await persistAvatar(supabase, username, rawPic)) ?? rawPic;
    const updatePayload = {
      followers: p.followersCount ?? null,
      er,
      avg_likes: avgLikes,
      profile_pic: storedPic,
      biography: p.biography ?? null,
      is_verified: !!p.verified,
      raw_json: p as unknown as Record<string, unknown>,
      status: 'auto',
      attempts: 0,
      scraped_at: now,
      updated_at: now,
    };

    const { error: upErr, count } = await supabase
      .from('instagram_cache')
      .update(updatePayload, { count: 'exact' })
      .eq('username', username);

    if (upErr) {
      console.error(
        `[update-hit] ${username} FAILED: ${upErr.message} payload-keys=${JSON.stringify(Object.keys(updatePayload))}`,
      );
      // Log to system_errors too so the operator can see it.
      await supabase.from('system_errors').insert({
        type: 'apify_fail',
        key: username,
        message: `instagram_cache UPDATE failed: ${upErr.message}`,
        source: 'scrape-pending-apify',
      });
      failed++;
      continue;
    }
    console.log(
      `[update-hit] ${username} rows-affected=${count} followers=${p.followersCount}`,
    );

    // Propagate fresh metrics + identity to creators row (if exists). Uses
    // COALESCE-style semantics — never clobber non-null existing values.
    try {
      const creatorPatch: Record<string, unknown> = {
        followers: p.followersCount ?? null,
        er,
        avg_likes: avgLikes,
        profile_pic: storedPic,
        verification: p.verified ? 'Yes' : 'No',
        category: tierFor(p.followersCount ?? null),
      };
      if (p.fullName) creatorPatch.inf_name = p.fullName;
      const { data: creatorRows, error: cUpErr } = await supabase
        .from('creators')
        .update(creatorPatch)
        .eq('username', username)
        .select('inf_id');
      if (cUpErr) {
        console.error(`[creator-sync] ${username} FAILED: ${cUpErr.message}`);
      } else {
        console.log(`[creator-sync] ${username} rows-affected=${(creatorRows ?? []).length}`);
      }
    } catch (e) {
      console.error(`[creator-sync] ${username} exception: ${e instanceof Error ? e.message : e}`);
    }

    // Auto-resolve open ig_fetch / apify_fail entries.
    await supabase
      .from('system_errors')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: 'scrape-pending-apify',
      })
      .in('type', ['ig_fetch', 'apify_fail'])
      .eq('key', username)
      .eq('resolved', false);

    scraped++;
  }

  console.log(
    `[done] scraped=${scraped} failed=${failed} batch=${usernames.length} apify-items=${apifyRawCount}`,
  );

  // ── Post-date backfill pass (Posted/Delivered rows with NULL post_date) ──
  // Decodes from Instagram shortcode (instant, no API). Always runs, even if
  // the apify batch was empty.
  const postDateStats = await backfillPostDates(supabase);
  console.log(
    `[postdate-backfill] done scanned=${postDateStats.scanned} updated=${postDateStats.updated} decoded=${postDateStats.decoded} fallback=${postDateStats.fallback}`,
  );

  // ── Payment-state reconciliation (legacy `recomputePaymentStates`) ─────
  // Flips Not Due → Due when due_date is in the past + heals NULL
  // estimated_payable_date values. Lightweight, idempotent.
  const paymentStateStats = await recomputePaymentStates(supabase);
  console.log(
    `[payment-recompute] scanned=${paymentStateStats.scanned} flipped=${paymentStateStats.flippedToDue} healed=${paymentStateStats.estPayableHealed} testedCleared=${paymentStateStats.testedCleared}`,
  );

  return new Response(
    JSON.stringify({
      ok: true,
      scraped,
      failed,
      batch: usernames.length,
      apifyItems: apifyRawCount,
      postDateBackfill: postDateStats,
      paymentRecompute: paymentStateStats,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
});
