// Append a row to the Change Log TABLE of GDoc "Workflow & Tools Master"
// › sub-tab "Influencer - Technical Design" (STANDING RULE: every shippable
// change adds a row here, same push as CreatorHub-Changelog-AddOns.md).
//
//   node scripts/append-gdoc-changelog.mjs "2026-07-16" "What changed…" "abc1234"
//
// Auth: saadaa-creator-hub service account (Editor on the doc), read from
// apps/web/.env.local GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON. No impersonation.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const [DATE, CHANGE, REF = ""] = process.argv.slice(2);
if (!DATE || !CHANGE) {
  console.error('usage: node append-gdoc-changelog.mjs "DATE" "CHANGE" ["REF"]');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(join(root, "apps/web/.env.local"), "utf8");
const line = env
  .split("\n")
  .find((l) => l.startsWith("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON="));
if (!line) throw new Error("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON not in .env.local");
const SA = JSON.parse(line.slice(line.indexOf("=") + 1));

const DOC_ID = "1NddIh6AZvpAhWs4JEUwTrmfpfHH4og7eExAW_dyXUI8";
const TAB_ID = "t.h63gsqoddfya";

const b64u = (s) => Buffer.from(s).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const pay = b64u(
  JSON.stringify({
    iss: SA.client_email,
    scope: "https://www.googleapis.com/auth/documents",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }),
);
const signer = crypto.createSign("RSA-SHA256");
signer.update(`${head}.${pay}`);
const jwt = `${head}.${pay}.${signer.sign(SA.private_key).toString("base64url")}`;
const { access_token } = await (
  await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
).json();
if (!access_token) throw new Error("token grant failed");
const H = { Authorization: `Bearer ${access_token}` };

async function getTab() {
  const doc = await (
    await fetch(
      `https://docs.googleapis.com/v1/documents/${DOC_ID}?includeTabsContent=true`,
      { headers: H },
    )
  ).json();
  if (doc.error) throw new Error(JSON.stringify(doc.error).slice(0, 200));
  const find = (tabs) => {
    for (const t of tabs ?? []) {
      if (t.tabProperties?.tabId === TAB_ID) return t;
      const hit = find(t.childTabs);
      if (hit) return hit;
    }
    return null;
  };
  const tab = find(doc.tabs);
  if (!tab) throw new Error("tab not found");
  return tab.documentTab.body.content;
}

async function batch(requests) {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${DOC_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    },
  );
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
}

// Insert a row directly below the header of the LAST table in the tab
// (Change Log: Date | Change | Ref — newest first).
let content = await getTab();
const tbl = content.filter((el) => el.table).pop();
if (!tbl) throw new Error("no table in tab");
await batch([
  {
    insertTableRow: {
      tableCellLocation: {
        tableStartLocation: { index: tbl.startIndex, tabId: TAB_ID },
        rowIndex: 0,
        columnIndex: 0,
      },
      insertBelow: true,
    },
  },
]);

// Fill the new row's cells right-to-left so earlier indexes stay valid.
content = await getTab();
const findTable = () =>
  content.filter((el) => el.table).find((el) => el.startIndex === tbl.startIndex) ??
  content.filter((el) => el.table).pop();
const cells = findTable().table.tableRows[1].tableCells;
const texts = [DATE, CHANGE, REF];
const inserts = [];
for (let i = cells.length - 1; i >= 0; i--) {
  if (texts[i]) {
    inserts.push({
      insertText: {
        location: { index: cells[i].content[0].startIndex, tabId: TAB_ID },
        text: texts[i],
      },
    });
  }
}
await batch(inserts);

// Match the table's 9.5pt body size.
content = await getTab();
const row = findTable().table.tableRows[1];
await batch([
  {
    updateTextStyle: {
      range: { startIndex: row.startIndex, endIndex: row.endIndex, tabId: TAB_ID },
      textStyle: { fontSize: { magnitude: 9.5, unit: "PT" } },
      fields: "fontSize",
    },
  },
]);
console.log("Change Log row added:", DATE, "·", REF || "(no ref)");
