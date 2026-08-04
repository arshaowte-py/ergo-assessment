import { env } from "./env";
import { DRIVE_BASE, DRIVE_UPLOAD_BASE, googleFetch } from "./google";

export type DriveFile = {
  id: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
  mimeType?: string;
};

const FILE_FIELDS = "id,name,mimeType,webViewLink,webContentLink";

/** Escape a value for a Drive `q` string literal. */
function q(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findInFolder(name: string, folderId: string): Promise<DriveFile | null> {
  const res = await googleFetch<{ files?: DriveFile[] }>(DRIVE_BASE, {
    query: {
      q: `name = '${q(name)}' and '${q(folderId)}' in parents and trashed = false`,
      fields: `files(${FILE_FIELDS})`,
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    },
  });
  return res.files?.[0] ?? null;
}

async function shareAnyoneWithLink(fileId: string): Promise<void> {
  try {
    await googleFetch(`${DRIVE_BASE}/${fileId}/permissions`, {
      method: "POST",
      query: { supportsAllDrives: true, sendNotificationEmail: false },
      json: { role: "reader", type: "anyone" },
    });
  } catch (err) {
    // Domain policy may forbid public links. The file still exists and is
    // reachable by anyone the folder is shared with — don't fail the submission.
    console.warn("[drive] could not set anyone-with-link sharing:", describe(err));
  }
}

/**
 * Write a file into the assessment folder, replacing any same-named file in
 * place so the shareable link stays stable across re-syncs.
 */
export async function uploadFile(opts: {
  name: string;
  mimeType: string;
  data: Buffer;
  folderId?: string;
}): Promise<DriveFile> {
  const folderId = opts.folderId ?? env.driveFolderId;
  if (!folderId) throw new Error("DRIVE_FOLDER_ID is not configured");

  const existing = await findInFolder(opts.name, folderId);

  if (existing) {
    const updated = await googleFetch<DriveFile>(`${DRIVE_UPLOAD_BASE}/${existing.id}`, {
      method: "PATCH",
      query: { uploadType: "media", fields: FILE_FIELDS, supportsAllDrives: true },
      headers: { "Content-Type": opts.mimeType },
      body: new Uint8Array(opts.data),
    });
    return updated;
  }

  const created = await uploadMultipart({
    metadata: { name: opts.name, parents: [folderId] },
    mimeType: opts.mimeType,
    data: opts.data,
  });
  await shareAnyoneWithLink(created.id);
  return created;
}

/** RFC 2387 multipart upload — metadata part + media part in one request. */
async function uploadMultipart(opts: {
  metadata: Record<string, unknown>;
  mimeType: string;
  data: Buffer;
  targetMimeType?: string;
}): Promise<DriveFile> {
  const boundary = `ergo-${Math.random().toString(36).slice(2)}-${opts.data.length}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(opts.metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${opts.mimeType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, opts.data, tail]);

  return googleFetch<DriveFile>(DRIVE_UPLOAD_BASE, {
    method: "POST",
    query: { uploadType: "multipart", fields: FILE_FIELDS, supportsAllDrives: true },
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
  });
}

/**
 * Convert HTML to PDF using Drive's own converter: import the HTML as a Google
 * Doc, export it as PDF, then bin the temporary Doc. This is the same engine the
 * old Apps Script relied on — lower fidelity than headless Chromium, but it has
 * no binary dependency, so it makes a dependable fallback.
 */
export async function convertHtmlToPdfViaDrive(html: string): Promise<Buffer> {
  const doc = await uploadMultipart({
    metadata: {
      name: `tmp-ergo-${Date.now()}`,
      mimeType: "application/vnd.google-apps.document",
      ...(env.driveFolderId ? { parents: [env.driveFolderId] } : {}),
    },
    mimeType: "text/html",
    data: Buffer.from(html, "utf8"),
  });

  try {
    const res = await googleFetch<Response>(`${DRIVE_BASE}/${doc.id}/export`, {
      query: { mimeType: "application/pdf" },
      raw: true,
    });
    return Buffer.from(await res.arrayBuffer());
  } finally {
    await googleFetch(`${DRIVE_BASE}/${doc.id}`, {
      method: "DELETE",
      query: { supportsAllDrives: true },
    }).catch(() => {
      /* leaving a temp doc behind is not worth failing the request over */
    });
  }
}

/** Stable, embeddable image URL for a Drive file (Drive's webViewLink is a viewer page). */
export function driveThumbnailUrl(link: string, size = 1200): string | null {
  const id = driveFileId(link);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${size}` : null;
}

export function driveFileId(link: string): string | null {
  if (!link) return null;
  const m =
    link.match(/\/file\/d\/([A-Za-z0-9_-]+)/) ??
    link.match(/[?&]id=([A-Za-z0-9_-]+)/) ??
    link.match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
