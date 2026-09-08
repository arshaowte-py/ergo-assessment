#!/usr/bin/env node
/**
 * Create the storage bucket and prove it works end to end.
 *
 *   npm run init:supabase
 *
 * Uploads a probe file, fetches its public URL with no credentials at all
 * (which is what a customer opening a report link does), then deletes it.
 */
const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const bucket = process.env.SUPABASE_BUCKET || "ergo-assessments";

if (!url || !key) {
  console.error(`
SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.

Find them in your Supabase project under Settings -> API:
  SUPABASE_URL               = Project URL          (https://xxxx.supabase.co)
  SUPABASE_SERVICE_ROLE_KEY  = service_role key     (secret — server-side only)

The service_role key bypasses row-level security. Keep it in Vercel's
environment variables and never ship it to the portal or any browser.
`);
  process.exit(1);
}

const auth = { Authorization: `Bearer ${key}`, apikey: key };

// 1. Bucket
const existing = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
  headers: auth,
});
if (existing.ok) {
  const b = await existing.json();
  console.log(`Bucket "${bucket}" already exists (public: ${b.public}).`);
  if (!b.public) {
    console.log('WARNING: bucket is private — report links will 400. Set it to public.');
  }
} else {
  const created = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      file_size_limit: 26_214_400,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    }),
  });
  if (!created.ok) {
    console.error(`Could not create bucket: ${created.status} ${await created.text()}`);
    process.exit(1);
  }
  console.log(`Created public bucket "${bucket}".`);
}

// 2. Upload a probe
const probePath = "_healthcheck/probe.txt";
const put = await fetch(
  `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${probePath}`,
  {
    method: "POST",
    headers: { ...auth, "Content-Type": "text/plain", "x-upsert": "true" },
    body: "ok",
  },
);
console.log(put.ok ? "Upload: ok" : `Upload FAILED: ${put.status} ${await put.text()}`);

// 3. Read it back with no auth — the customer's view of a report link
const publicHref = `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${probePath}`;
const anon = await fetch(publicHref);
console.log(
  anon.ok
    ? "Public read (no credentials): ok"
    : `Public read FAILED: ${anon.status} — the bucket is probably not public`,
);

// 4. Clean up
await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${probePath}`, {
  method: "DELETE",
  headers: auth,
});

console.log(`
Storage is ready. Set these on Vercel (Production + Preview):

SUPABASE_URL=${url}
SUPABASE_SERVICE_ROLE_KEY=<your service_role key>
SUPABASE_BUCKET=${bucket}

Once they are set, /api/health reports "storage": "supabase" and uploads stop
using Drive. The Google Sheet is unchanged — it still holds every row.
`);
