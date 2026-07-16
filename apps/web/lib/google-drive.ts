import "server-only";
import crypto from "node:crypto";

/**
 * Google Drive uploads for collab content — the "Saadaa All Collabs" folder.
 *
 * On posting submit the reel's video is filed automatically:
 *   Saadaa All Collabs / {collab_id} / {post_id}.mp4
 * so the team stops downloading reels by hand and re-uploading them to Drive.
 *
 * Auth: the existing service account with domain-wide delegation, impersonating
 * the folder owner (marketing@saadaa.in). Uploads are owned by that user and
 * use the workspace quota — the service account's own 15GB is never touched.
 *
 * Env (Vercel + .env.local):
 *   GOOGLE_SA_EMAIL            service-account client_email
 *   GOOGLE_SA_PRIVATE_KEY      private key ("\n"-escaped is fine)
 *   GOOGLE_DRIVE_IMPERSONATE   workspace user to act as (folder owner)
 *   DRIVE_COLLABS_FOLDER_ID    the "Saadaa All Collabs" folder id
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive";

let tokenCache: { token: string; exp: number } | null = null;

function b64url(s: string | Buffer): string {
  return Buffer.from(s).toString("base64url");
}

export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SA_EMAIL?.trim() &&
      process.env.GOOGLE_SA_PRIVATE_KEY?.trim() &&
      process.env.GOOGLE_DRIVE_IMPERSONATE?.trim() &&
      process.env.DRIVE_COLLABS_FOLDER_ID?.trim(),
  );
}

async function getDriveToken(): Promise<string | null> {
  const email = process.env.GOOGLE_SA_EMAIL?.trim();
  const key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const sub = process.env.GOOGLE_DRIVE_IMPERSONATE?.trim();
  if (!email || !key || !sub) return null;

  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && now < tokenCache.exp - 120) return tokenCache.token;

  try {
    const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const pay = b64url(
      JSON.stringify({
        iss: email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
        sub,
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
    if (!json.access_token) return null;
    tokenCache = { token: json.access_token, exp: now + 3500 };
    return json.access_token;
  } catch (e) {
    console.warn("[drive] token failed:", e instanceof Error ? e.name : e);
    return null;
  }
}

/** Find-or-create the collab's folder inside "Saadaa All Collabs". */
async function ensureCollabFolder(
  token: string,
  collabId: string,
): Promise<string | null> {
  const parent = process.env.DRIVE_COLLABS_FOLDER_ID?.trim();
  if (!parent) return null;
  const name = collabId.trim();
  if (!name) return null;

  const q = encodeURIComponent(
    `name = '${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const list = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
  );
  if (list.ok) {
    const j = (await list.json()) as { files?: Array<{ id: string }> };
    if (j.files?.[0]?.id) return j.files[0].id;
  }

  const create = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parent],
      }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!create.ok) {
    console.warn(`[drive] folder create ${name}: ${create.status}`);
    return null;
  }
  return ((await create.json()) as { id?: string }).id ?? null;
}

/**
 * End-to-end Drive self-test for /api/drive-health — proves the RUNTIME can
 * do everything a posting submit needs: read env, mint a delegated token,
 * see the parent folder, create/reuse a folder, upload a file, delete it.
 * Only touches its own scrap file inside a "_healthcheck" folder.
 */
export async function driveHealthcheck(): Promise<{
  configured: boolean;
  token: boolean;
  parentFolder: string | null;
  uploadOk: boolean;
  cleanupOk: boolean;
  error?: string;
}> {
  const out = {
    configured: isDriveConfigured(),
    token: false,
    parentFolder: null as string | null,
    uploadOk: false,
    cleanupOk: false,
    error: undefined as string | undefined,
  };
  if (!out.configured) {
    out.error = "Drive env vars missing on this runtime";
    return out;
  }
  const token = await getDriveToken();
  if (!token) {
    out.error = "token grant failed (key/impersonation)";
    return out;
  }
  out.token = true;

  const parent = process.env.DRIVE_COLLABS_FOLDER_ID!.trim();
  const meta = await fetch(
    `https://www.googleapis.com/drive/v3/files/${parent}?fields=name`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
  );
  if (!meta.ok) {
    out.error = `parent folder not visible (HTTP ${meta.status})`;
    return out;
  }
  out.parentFolder = ((await meta.json()) as { name?: string }).name ?? null;

  const link = await uploadCollabVideo(
    "_healthcheck",
    `healthcheck-${Date.now()}.txt`,
    new TextEncoder().encode("CreatorHub drive-health OK").buffer as ArrayBuffer,
    "text/plain",
  );
  out.uploadOk = Boolean(link);
  if (!link) {
    out.error = "upload failed";
    return out;
  }

  // Delete the scrap file we just made (find by link-independent search).
  try {
    const q = encodeURIComponent(
      `name contains 'healthcheck-' and trashed = false`,
    );
    const list = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
    );
    const files = ((await list.json()) as { files?: Array<{ id: string }> })
      .files ?? [];
    for (const f of files) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
    }
    out.cleanupOk = true;
  } catch {
    out.cleanupOk = false;
  }
  return out;
}

/**
 * Upload a collab video: Saadaa All Collabs / {collabId} / {fileName}.
 * Overwrites nothing — an existing same-named file is reused (its link is
 * returned) so re-submits never duplicate. Returns the webViewLink.
 */
export async function uploadCollabVideo(
  collabId: string,
  fileName: string,
  buf: ArrayBuffer,
  mime = "video/mp4",
): Promise<string | null> {
  if (!isDriveConfigured()) return null;
  const token = await getDriveToken();
  if (!token) return null;

  const folderId = await ensureCollabFolder(token, collabId);
  if (!folderId) return null;

  // Same-named file already there (re-submit) → reuse its link.
  const q = encodeURIComponent(
    `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`,
  );
  const existing = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,webViewLink)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
  );
  if (existing.ok) {
    const j = (await existing.json()) as {
      files?: Array<{ id: string; webViewLink?: string }>;
    };
    if (j.files?.[0]?.webViewLink) return j.files[0].webViewLink;
  }

  const boundary = `saadaa${crypto.randomBytes(8).toString("hex")}`;
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    Buffer.from(buf),
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const up = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!up.ok) {
    console.warn(
      `[drive] upload ${fileName}: ${up.status} ${(await up.text()).slice(0, 120)}`,
    );
    return null;
  }
  return (
    ((await up.json()) as { webViewLink?: string }).webViewLink ?? null
  );
}
