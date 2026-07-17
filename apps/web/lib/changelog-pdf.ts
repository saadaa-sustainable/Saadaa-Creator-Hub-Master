import "server-only";

/**
 * Zero-dependency PDF builder for the daily changelog 1-pager.
 *
 * Hand-rolled (no pdfkit) so nothing needs font-file tracing on Vercel: uses
 * the base-14 Helvetica faces every PDF viewer ships. "Interactive" = real
 * link annotations — each commit ref is clickable (GitHub commit) and the
 * header links to the live app. Multi-page when a day ships a lot.
 */

const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 48;
const REPO_URL =
  "https://github.com/saadaa-sustainable/Saadaa-Creator-Hub-Master";
const APP_URL = "https://saadaa-creator-hub-master.vercel.app";

// Rough Helvetica advance widths (per 1000 units) — enough for wrapping.
const AVG = 500;
const WIDE = new Set("mwMW@");
const NARROW = new Set("iljtfrI.,;:'\"()[]| ");
function textWidth(s: string, size: number): number {
  let units = 0;
  for (const ch of s) {
    units += WIDE.has(ch) ? 833 : NARROW.has(ch) ? 278 : AVG;
  }
  return (units / 1000) * size;
}

function wrap(text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (textWidth(candidate, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Base-14 fonts are WinAnsi — strip anything outside Latin-1 to avoid
    // mojibake (₹ → Rs, arrows/em dashes → plain equivalents).
    .replace(/₹/g, "Rs ")
    .replace(/[—–]/g, "-")
    .replace(/[→⇒]/g, "->")
    .replace(/[·•]/g, "*")
    .replace(/∪/g, "U")
    .replace(/[≥≤]/g, (m) => (m === "≥" ? ">=" : "<="))
    .replace(/[^\x20-\xFF]/g, "?");
}

interface LinkRect {
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

class Page {
  ops: string[] = [];
  links: LinkRect[] = [];
  y = PAGE_H - MARGIN;

  text(
    x: number,
    size: number,
    str: string,
    opts: { bold?: boolean; color?: string; link?: string } = {},
  ) {
    const font = opts.bold ? "F2" : "F1";
    const color = opts.color ?? "0.086 0.082 0.075"; // #161513
    this.ops.push(
      `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${this.y.toFixed(2)} Tm (${esc(str)}) Tj ET`,
    );
    if (opts.link) {
      this.links.push({
        x,
        y: this.y - size * 0.25,
        w: textWidth(str, size),
        h: size * 1.25,
        url: opts.link,
      });
    }
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ops.push(
      `${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
    );
  }
}

export function buildChangelogPdf(input: {
  dateLabel: string;
  entries: Array<{ change: string; ref: string }>;
  generatedAt: string;
}): Buffer {
  const pages: Page[] = [];
  let page = new Page();
  pages.push(page);

  const newPageIfNeeded = (needed: number) => {
    if (page.y - needed < MARGIN + 20) {
      page = new Page();
      pages.push(page);
    }
  };

  // ── Header band (Saadaa dark + accent) ──
  page.rect(0, PAGE_H - 96, PAGE_W, 96, "0.173 0.141 0.125"); // #2C2420
  page.rect(0, PAGE_H - 100, PAGE_W, 4, "0.941 0.776 0.118"); // #F0C61E
  page.y = PAGE_H - 46;
  page.text(MARGIN, 19, "Saadaa CreatorHub - Daily Change Log", {
    bold: true,
    color: "1 0.988 0.965",
    link: APP_URL,
  });
  page.y = PAGE_H - 68;
  page.text(MARGIN, 11, input.dateLabel, { color: "0.941 0.776 0.118" });
  page.y = PAGE_H - 84;
  page.text(
    MARGIN,
    8.5,
    `${input.entries.length} change${input.entries.length === 1 ? "" : "s"} shipped * generated ${input.generatedAt} * tap a commit ref to open it`,
    { color: "0.812 0.784 0.737" },
  );
  page.y = PAGE_H - 128;

  // ── Entries ──
  const bodySize = 10;
  const lineH = 14.5;
  const textX = MARGIN + 18;
  const maxW = PAGE_W - textX - MARGIN;

  input.entries.forEach((entry, i) => {
    const lines = wrap(entry.change, bodySize, maxW);
    const refs = entry.ref
      .split(/[\s,]+/)
      .map((r) => r.trim())
      .filter((r) => /^[0-9a-f]{7,10}$/i.test(r));
    const blockH = lines.length * lineH + (entry.ref ? lineH : 0) + 14;
    newPageIfNeeded(blockH);

    // Number chip
    page.rect(MARGIN - 2, page.y - 3, 13, 13, "0.941 0.776 0.118");
    page.text(MARGIN + 1.2, 8, String(i + 1), { bold: true });

    for (const [li, line] of lines.entries()) {
      page.text(textX, bodySize, line, { bold: li === 0 && false });
      page.y -= lineH;
    }
    if (entry.ref) {
      let x = textX;
      page.text(x, 8.5, "Commits: ", { color: "0.604 0.576 0.518" });
      x += textWidth("Commits: ", 8.5) + 2;
      if (refs.length > 0) {
        for (const r of refs) {
          page.text(x, 8.5, r, {
            bold: true,
            color: "0.231 0.435 0.831",
            link: `${REPO_URL}/commit/${r}`,
          });
          x += textWidth(r, 8.5) + 10;
        }
      } else {
        page.text(x, 8.5, entry.ref, { color: "0.604 0.576 0.518" });
      }
      page.y -= lineH;
    }
    page.y -= 8;
  });

  if (input.entries.length === 0) {
    page.text(MARGIN, 11, "No changes were logged for this day.", {
      color: "0.604 0.576 0.518",
    });
    page.y -= lineH;
  }

  // ── Footer on every page ──
  pages.forEach((p, idx) => {
    const savedY = p.y;
    p.y = MARGIN - 14;
    p.text(MARGIN, 8, "Saadaa CreatorHub", {
      color: "0.604 0.576 0.518",
      link: APP_URL,
    });
    p.text(PAGE_W - MARGIN - 60, 8, `Page ${idx + 1} of ${pages.length}`, {
      color: "0.604 0.576 0.518",
    });
    p.y = savedY;
  });

  // ── Assemble the PDF object graph ──
  // 1 Catalog, 2 Pages, 3 F1, 4 F2, then per page: Page obj, Contents obj,
  // then one Annot obj per link.
  const objects: string[] = [];
  const addObj = (body: string): number => {
    objects.push(body);
    return objects.length; // 1-indexed object number
  };

  const f1 = addObj(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const f2 = addObj(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  const pageObjNums: number[] = [];
  // Each Page needs /Parent = the Pages object, whose number isn't known until
  // all page/content/annot objects exist — write a token, patch in pass two.
  const PARENT_TOKEN = "@@PAGES@@";
  for (const p of pages) {
    const stream = p.ops.join("\n");
    const contents = addObj(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    const annotNums: number[] = [];
    for (const l of p.links) {
      annotNums.push(
        addObj(
          `<< /Type /Annot /Subtype /Link /Rect [${l.x.toFixed(2)} ${l.y.toFixed(2)} ${(l.x + l.w).toFixed(2)} ${(l.y + l.h).toFixed(2)}] /Border [0 0 0] /A << /S /URI /URI (${esc(l.url)}) >> >>`,
        ),
      );
    }
    const annots = annotNums.length
      ? ` /Annots [${annotNums.map((n) => `${n} 0 R`).join(" ")}]`
      : "";
    pageObjNums.push(
      addObj(
        `<< /Type /Page /Parent ${PARENT_TOKEN} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contents} 0 R${annots} >>`,
      ),
    );
  }
  const pagesNum = addObj(
    `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  const catalogNum = addObj(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);

  const finalObjects = objects.map((o) =>
    o.replace(new RegExp(PARENT_TOKEN, "g"), String(pagesNum)),
  );

  // Serialize with xref.
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  finalObjects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${finalObjects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    out += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${finalObjects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(out, "latin1");
}
