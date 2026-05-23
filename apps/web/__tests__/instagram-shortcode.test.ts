import { describe, expect, it } from "vitest";
import {
  extractShortcode,
  postDateFromUrl,
  shortcodeToDate,
  usernameFromUrl,
} from "@/lib/instagram-shortcode";

/**
 * Tests the Instagram shortcode → date decode (legacy parity).
 * Formula: ts_ms = (media_id >> 23) + 1_314_220_021_721
 * Alphabet: base64url (A-Z a-z 0-9 - _)
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Encode a media-id (BigInt) → shortcode string (base64url, no padding). */
function idToShortcode(id: bigint): string {
  if (id === 0n) return ALPHABET[0];
  let s = "";
  let cur = id;
  while (cur > 0n) {
    const idx = Number(cur % 64n);
    s = ALPHABET[idx] + s;
    cur = cur / 64n;
  }
  return s;
}

/** Encode a Date → shortcode by reversing the decode formula. */
function dateToShortcode(d: Date, shiftedExtra = 0n): string {
  const epoch = 1_314_220_021_721n;
  const tsMs = BigInt(d.getTime());
  // id >> 23 = tsMs - epoch  →  id = ((tsMs - epoch) << 23) | extraLowBits
  const id = ((tsMs - epoch) << 23n) | shiftedExtra;
  return idToShortcode(id);
}

describe("extractShortcode", () => {
  it("pulls shortcode from /p/ feed URL", () => {
    expect(extractShortcode("https://www.instagram.com/p/Cabc123_/")).toBe(
      "Cabc123_",
    );
  });
  it("pulls shortcode from /reel/ URL", () => {
    expect(extractShortcode("https://instagram.com/reel/DxyZ-7890/")).toBe(
      "DxyZ-7890",
    );
  });
  it("pulls shortcode from /reels/ URL", () => {
    expect(
      extractShortcode("https://www.instagram.com/reels/AbCdEf12345/"),
    ).toBe("AbCdEf12345");
  });
  it("pulls shortcode from /tv/ URL", () => {
    expect(extractShortcode("https://www.instagram.com/tv/Cxyz999_-/")).toBe(
      "Cxyz999_-",
    );
  });
  it("pulls shortcode with username prefix", () => {
    expect(
      extractShortcode("https://www.instagram.com/saadaa/p/Cabc123_/"),
    ).toBe("Cabc123_");
  });
  it("strips trailing slash + query", () => {
    expect(
      extractShortcode("https://instagram.com/p/Cabc/?utm_source=ig"),
    ).toBe("Cabc");
  });
  it("returns null for non-IG URL", () => {
    expect(extractShortcode("https://twitter.com/x/status/1")).toBe(null);
  });
  it("returns null on empty / null", () => {
    expect(extractShortcode("")).toBe(null);
    expect(extractShortcode(null)).toBe(null);
    expect(extractShortcode(undefined)).toBe(null);
  });
});

describe("usernameFromUrl", () => {
  it("returns username from /{user}/p/{code}/", () => {
    expect(
      usernameFromUrl("https://www.instagram.com/saadaa/p/Cabc/"),
    ).toBe("saadaa");
  });
  it("returns null for /reel/ without username", () => {
    expect(usernameFromUrl("https://instagram.com/reel/Cabc/")).toBe(null);
  });
  it("lowercases", () => {
    expect(usernameFromUrl("https://instagram.com/SAADAA/p/x/")).toBe("saadaa");
  });
});

describe("shortcodeToDate — known math", () => {
  it("decodes id=0 → Instagram epoch 2011-08-24", () => {
    const d = shortcodeToDate("A"); // id=0
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe("2011-08-24");
  });

  it("rejects garbage characters", () => {
    expect(shortcodeToDate("***")).toBe(null);
  });

  it("rejects empty", () => {
    expect(shortcodeToDate("")).toBe(null);
  });
});

describe("shortcodeToDate — round-trip with synthetic codes", () => {
  const cases: Array<{ iso: string; label: string }> = [
    { iso: "2024-01-15", label: "early 2024" },
    { iso: "2024-06-30", label: "mid 2024" },
    { iso: "2025-12-25", label: "Christmas 2025" },
    { iso: "2026-05-22", label: "today-ish" },
    { iso: "2020-11-03", label: "2020 mid" },
  ];

  for (const { iso, label } of cases) {
    it(`encodes + decodes ${label} (${iso})`, () => {
      const d = new Date(iso + "T12:00:00Z");
      const code = dateToShortcode(d);
      const back = shortcodeToDate(code);
      expect(back).not.toBeNull();
      expect(back!.toISOString().slice(0, 10)).toBe(iso);
    });
  }

  it("low 23 bits do not change the day", () => {
    const d = new Date("2024-06-15T12:00:00Z");
    const code1 = dateToShortcode(d, 0n);
    const code2 = dateToShortcode(d, (1n << 23n) - 1n); // max low bits
    expect(shortcodeToDate(code1)!.toISOString().slice(0, 10)).toBe(
      "2024-06-15",
    );
    expect(shortcodeToDate(code2)!.toISOString().slice(0, 10)).toBe(
      "2024-06-15",
    );
  });
});

describe("postDateFromUrl — end-to-end", () => {
  it("returns ISO date for an IG post URL", () => {
    const d = new Date("2025-03-10T10:00:00Z");
    const code = dateToShortcode(d);
    const url = `https://www.instagram.com/p/${code}/`;
    expect(postDateFromUrl(url)).toBe("2025-03-10");
  });

  it("returns ISO date for an IG reel URL", () => {
    const d = new Date("2024-09-01T10:00:00Z");
    const code = dateToShortcode(d);
    const url = `https://instagram.com/reel/${code}/`;
    expect(postDateFromUrl(url)).toBe("2024-09-01");
  });

  it("returns null for non-IG URL", () => {
    expect(postDateFromUrl("https://tiktok.com/@x/video/1")).toBe(null);
  });

  it("returns null for null/empty", () => {
    expect(postDateFromUrl(null)).toBe(null);
    expect(postDateFromUrl("")).toBe(null);
  });
});
