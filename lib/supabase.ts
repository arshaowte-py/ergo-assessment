import { env } from "./env";

/**
 * Supabase Storage over its REST API.
 *
 * Chosen over Drive because a service-role key has no storage quota of its own,
 * no consent screen, and no refresh token to expire — the three things that made
 * the Drive path fragile. Objects in a public bucket are served straight from a
 * permanent URL, so the link in the sheet is the file.
 */

function base(): string {
  const url = env.supabaseUrl.replace(/\/+$/, "");
  if (!url) throw new Error("SUPABASE_URL is not configured");
  return url;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = env.supabaseServiceKey;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

/** Public URL for an object in a public bucket. */
export function publicUrl(objectPath: string): string {
  const path = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${base()}/storage/v1/object/public/${encodeURIComponent(env.supabaseBucket)}/${path}`;
}

/**
 * Upload, replacing any object already at the same path.
 *
 * `x-upsert` is what keeps links stable across the portal's repeated syncs —
 * the same assessment always writes to the same path, so the URL already in the
 * sheet keeps resolving instead of accumulating duplicates.
 */
export async function uploadObject(opts: {
  path: string;
  mimeType: string;
  data: Buffer;
}): Promise<string> {
  const path = opts.path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(
    `${base()}/storage/v1/object/${encodeURIComponent(env.supabaseBucket)}/${path}`,
    {
      method: "POST",
      headers: headers({
        "Content-Type": opts.mimeType,
        "x-upsert": "true",
        "cache-control": "3600",
      }),
      body: new Uint8Array(opts.data),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase upload ${res.status}: ${text.slice(0, 300)}`);
  }
  return publicUrl(opts.path);
}

/** Create the bucket if it isn't there yet. Safe to call repeatedly. */
export async function ensureBucket(): Promise<"created" | "exists"> {
  const name = env.supabaseBucket;
  const check = await fetch(`${base()}/storage/v1/bucket/${encodeURIComponent(name)}`, {
    headers: headers(),
  });
  if (check.ok) return "exists";

  const res = await fetch(`${base()}/storage/v1/bucket`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: name,
      name,
      // Public: report links are opened by customers who have no account here,
      // exactly as the Drive anyone-with-link sharing did.
      public: true,
      file_size_limit: 26_214_400,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase bucket create ${res.status}: ${text.slice(0, 300)}`);
  }
  return "created";
}

/** Health check: is the bucket reachable and public? */
export async function bucketStatus(): Promise<{ name: string; public: boolean } | null> {
  const res = await fetch(
    `${base()}/storage/v1/bucket/${encodeURIComponent(env.supabaseBucket)}`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const b = (await res.json()) as { name?: string; public?: boolean };
  return { name: b.name ?? env.supabaseBucket, public: Boolean(b.public) };
}
