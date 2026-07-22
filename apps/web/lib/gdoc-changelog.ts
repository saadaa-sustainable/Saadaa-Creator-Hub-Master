import "server-only";
import crypto from "node:crypto";

/**
 * Reads the project Change Log TABLE from the Google Doc
 * "Workflow & Tools Master" › sub-tab "Influencer - Technical Design"
 * (the standing per-change registry every shippable change appends to).
 *
 * Auth: the existing Drive service account (GOOGLE_SA_EMAIL / _PRIVATE_KEY,
 * domain-wide delegation) impersonating website@saadaa.in — the doc owner's
 * side. Scope `drive` is accepted by the Docs API and is already authorized
 * for this SA's DWD client (marketing@ 403s on this doc; website@ works —
 * verified 2026-07-16).
 */

const DOC_ID = "1NddIh6AZvpAhWs4JEUwTrmfpfHH4og7eExAW_dyXUI8";
const TAB_ID = "t.h63gsqoddfya";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const IMPERSONATE = "website@saadaa.in";
const DOC_READ_TIMEOUT_MS = 30_000;
const DOC_FIELDS =
  "tabs(tabProperties(tabId),childTabs(tabProperties(tabId),documentTab(body(content(table(tableRows(tableCells(content(paragraph(elements(textRun(content))))))))))),documentTab(body(content(table(tableRows(tableCells(content(paragraph(elements(textRun(content))))))))))";

export interface ChangelogRow {
  /** Normalized ISO yyyy-MM-dd (rows store "2026-07-16" or "16 Jul 2026"). */
  dateIso: string | null;
  dateRaw: string;
  change: string;
  ref: string;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "2026-07-16" or "16 Jul 2026" (or "16 July 2026") → "2026-07-16". */
export function normalizeChangelogDate(raw: string): string | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(s);
  if (dmy) {
    const mon = MONTHS[dmy[2].slice(0, 3).toLowerCase()];
    if (mon) return `${dmy[3]}-${mon}-${dmy[1].padStart(2, "0")}`;
  }
  return null;
}

function b64url(s: string | Buffer): string {
  return Buffer.from(s).toString("base64url");
}

async function getDocsToken(): Promise<string | null> {
  const email = process.env.GOOGLE_SA_EMAIL?.trim();
  const key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;
  const now = Math.floor(Date.now() / 1000);
  try {
    const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const pay = b64url(
      JSON.stringify({
        iss: email,
        scope: "https://www.googleapis.com/auth/drive",
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
        sub: IMPERSONATE,
      }),
    );
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(`${head}.${pay}`);
    const jwt = `${head}.${pay}.${signer.sign(key).toString("base64url")}`;
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch (err) {
    console.error("[gdoc-changelog] token failed:", err);
    return null;
  }
}

type DocTab = {
  tabProperties?: { tabId?: string };
  childTabs?: DocTab[];
  documentTab?: { body?: { content?: unknown[] } };
};

function findTab(tabs: DocTab[] | undefined): DocTab | null {
  for (const t of tabs ?? []) {
    if (t.tabProperties?.tabId === TAB_ID) return t;
    const hit = findTab(t.childTabs);
    if (hit) return hit;
  }
  return null;
}

function cellText(cell: unknown): string {
  const content = (cell as { content?: unknown[] })?.content ?? [];
  return content
    .map((p) =>
      (((p as Record<string, unknown>).paragraph as Record<string, unknown>)
        ?.elements as Array<Record<string, unknown>> | undefined)
        ?.map(
          (e) =>
            ((e.textRun as Record<string, unknown>)?.content as string) ?? "",
        )
        .join("") ?? "",
    )
    .join("")
    .trim();
}

/** All Change Log rows (newest first — the table inserts below the header). */
export async function fetchChangelogRows(): Promise<ChangelogRow[]> {
  const token = await getDocsToken();
  if (!token) return [];
  let res: Response;
  try {
    const url = new URL(`https://docs.googleapis.com/v1/documents/${DOC_ID}`);
    url.searchParams.set("includeTabsContent", "true");
    url.searchParams.set("fields", DOC_FIELDS);
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DOC_READ_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[gdoc-changelog] doc read timed out/failed:", err);
    return [];
  }
  if (!res.ok) {
    console.error("[gdoc-changelog] doc read failed:", res.status);
    return [];
  }
  let doc: { tabs?: DocTab[] };
  try {
    doc = (await res.json()) as { tabs?: DocTab[] };
  } catch (err) {
    console.error("[gdoc-changelog] doc response parse failed:", err);
    return [];
  }
  const tab = findTab(doc.tabs);
  const content = (tab?.documentTab?.body?.content ?? []) as Array<
    Record<string, unknown>
  >;
  const tables = content.filter((el) => el.table);
  const tbl = tables[tables.length - 1] as
    | { table?: { tableRows?: Array<{ tableCells?: unknown[] }> } }
    | undefined;
  const rows = tbl?.table?.tableRows ?? [];
  const out: ChangelogRow[] = [];
  // Row 0 = header (Date | Change | Ref).
  for (const r of rows.slice(1)) {
    const cells = r.tableCells ?? [];
    const dateRaw = cellText(cells[0]);
    const change = cellText(cells[1]);
    const ref = cellText(cells[2]);
    if (!dateRaw && !change) continue;
    out.push({
      dateIso: normalizeChangelogDate(dateRaw),
      dateRaw,
      change,
      ref,
    });
  }
  return out;
}
