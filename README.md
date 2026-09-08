# Frido Ergo Assessment — Backend + Admin Dashboard

Replaces the Google Apps Script relay that was dropping large POST bodies. The
Google Sheet stays the database; this project is the API the portal talks to and
the dashboard the team reads.

- **API** — receives assessments from the portal, stores photos and the report
  PDF in Drive, upserts one row per assessment into the Sheet.
- **Admin** — `/admin` list, `/admin/[id]` detail, `/admin/stats` summary.

Stack: Next.js 15 (App Router) on Vercel, Tailwind v4, headless Chromium for
PDF rendering. Rows live in Google Sheets via a service account; files go to
Supabase Storage, falling back to Google Drive (see below).

---

## 1. Google setup (do this first)

1. In Google Cloud, create a project and a **service account**, then create a
   **JSON key** for it. Enable the **Google Sheets API** and **Google Drive API**.
2. Copy the service account's email (`…@….iam.gserviceaccount.com`).
3. Share **both** of these with that email as an **Editor**:
   - the Sheet `1wd1dO4vnmGUoP1iYciNKXCwQ6R5CoJCjT2YGrTTHEUo`
   - the Drive folder `1P3YldSpe8Ib_URDJK0SqfDaUC20R2Qcr`

Nothing works until step 3 is done — a service account is a separate identity and
has no access to your files by default.

### File storage: Supabase (recommended) or Drive

Photos and report PDFs go to **Supabase Storage** when `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are set, and to Google Drive otherwise. The Google
Sheet is the database either way — this only changes where files live and what
the links in the `Photo *` and `Report PDF` columns point at.

Supabase is the easier path: a service-role key has no storage quota, no consent
screen, and no refresh token to expire, which is what made the Drive route
fragile (see below). Free tier gives 1 GB, and at roughly 500 KB per assessment
that is about 2,000 assessments.

```bash
# 1. Create a project at supabase.com
# 2. Settings -> API -> copy the Project URL and the service_role key
# 3. Put both in .env.local, then:
npm run init:supabase
```

That creates the public bucket and verifies an upload can be read back with no
credentials — the same request a customer makes when opening a report link.

**Keep the service_role key server-side.** It bypasses row-level security. It
belongs in Vercel's environment variables and must never reach the portal or any
browser.

One caveat: Supabase pauses free projects after **7 days of inactivity**, and
restoring is a manual click. At steady assessment volume this never triggers;
during a long quiet stretch it will, and syncs fail until the project is
resumed. Paid tiers remove the pause.

### If you use Drive instead: it needs OAuth, not the service account

Google gives service accounts **no Drive storage quota**. Sharing the folder
with one is not enough: `files.create` returns

> `403 Service Accounts do not have storage quota. Leverage shared drives, or use OAuth delegation`

Shared Drives and OAuth delegation both require Google Workspace, so on a
personal Google account the fix is to upload as *yourself*. Sheets is unaffected
— it edits an existing file rather than creating one — so only Drive uses these
credentials.

1. At [Credentials](https://console.cloud.google.com/apis/credentials), create
   an **OAuth client ID** → **Web application**, with the authorised redirect URI
   `http://127.0.0.1:53682/callback`.
2. Put the client ID and secret in `.env.local`.
3. Set the **OAuth consent screen** publishing status to **In production**
   (Google Auth Platform → Audience → Publish app). While it says *Testing*,
   Google expires refresh tokens after 7 days and uploads start failing a week
   later. The app requests only `drive.file`, which is a non-sensitive scope,
   so publishing needs no verification and shows no warning screen. Requesting
   the full `drive` scope instead would make this impossible — restricted
   scopes require Google verification and a paid security assessment.
4. Run `npm run auth:drive`, approve the consent screen, and copy the printed
   `GOOGLE_OAUTH_REFRESH_TOKEN` into `.env.local` and Vercel.

If you later move the folder to a Shared Drive, leave the three OAuth variables
blank and the service account is used instead.

## 2. Local run

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run init:sheet             # verifies access, writes headers if the tab is empty
npm run dev                    # http://localhost:3000/admin
```

`npm run init:sheet` is the fastest way to confirm the credentials are right — it
prints the spreadsheet title, the row count, and whether the Drive folder is
writable.

## 3. Deploy to Vercel

Import the repo, then set the environment variables from `.env.example` under
**Settings → Environment Variables**.

For `GOOGLE_PRIVATE_KEY`, paste the value straight from the JSON key file —
including the `\n` escape sequences. The app normalises quoted, escaped, and
base64-encoded forms.

After the first deploy, check `https://<your-app>.vercel.app/api/health`. It
reports which env vars are present and how many rows the Sheet holds.

## 4. Point the portal at it

`portal/index.html` is already patched. Set the constant near the top of the
sync section to your deployed URL and redeploy the portal to Netlify:

```js
const API_URL="https://your-app.vercel.app";   // no trailing slash
const API_SECRET="";                            // must match API_SECRET on the backend
```

Also add the portal's origin to `ALLOWED_ORIGINS` if it isn't the default
`https://frido-ergoassessment.netlify.app`.

---

## API

| Route | Method | Purpose |
|---|---|---|
| `/api/submit` | POST | Row data (+ optional `reportHTML`, `photos`) → Drive + Sheet upsert |
| `/api/photo` | POST | One photo at a time → Drive, link written into the row |
| `/api/assessments` | GET | Filtered, sorted, paginated list |
| `/api/assessment/[id]` | GET | One assessment plus parsed sub-objects |
| `/api/stats` | GET | Aggregates behind `/admin/stats` |
| `/api/health` | GET | Connectivity + config check (reports the active storage backend) |

### `POST /api/submit`

```jsonc
{
  "token": "",                 // only needed if API_SECRET is set
  "row": { "Assessment ID": "FEC-260804-02Y", "Customer": "…", /* 57 keys */ },
  "photos": { "side": "data:image/jpeg;base64,…" },   // optional
  "reportHTML": "<div class=\"pbrand\">…"             // optional, #printDoc innerHTML
}
```

Returns `{ok: true, id, action: "created"|"updated", photos, reportPdf}`.
Non-fatal problems (one photo failed, PDF fell back to the Drive engine) come
back in a `warnings` array — the row is still written.

### `POST /api/photo`

```jsonc
{ "id": "FEC-260804-02Y", "angle": "side", "dataUrl": "data:image/jpeg;base64,…" }
```

`angle` is one of `side`, `above`, `back`, `seated`.

### `GET /api/assessments`

Filters: `physio`, `store`, `band`, `stage`, `q` (name / ID / phone / email),
`from`, `to` (`YYYY-MM-DD`). Sorting: `sort` (`date`, `customer`, `physio`,
`store`, `rosa`, `band`, `stage`) and `dir` (`asc` / `desc`). Paging: `limit`,
`offset` — omit `limit` to get everything.

Read endpoints accept either an admin session cookie or the `X-Api-Secret`
header.

---

## How the pieces fit

**Upsert.** The portal syncs twice per assessment — once on submit (no photos, no
report) and again on Done (the full payload). Both land in the same row, keyed on
`Assessment ID`. The four photo columns, `Report PDF`, and `Submitted at` are
preserved when a later sync leaves them blank, so the early sync's links survive.
`Photo count` is recomputed server-side from the links actually stored.

**Schema.** `lib/schema.ts` holds the authoritative 62-column order, matching
`reference/sheet_headers.txt` and the Apps Script it replaces. An existing
Assessments tab keeps working unchanged. Unknown keys in a payload are dropped
rather than shifting columns.

**PDF fidelity.** `scripts/extract-report-css.mjs` freezes every `<style>` block
from `portal/index.html` into `lib/report-css.generated.ts`, and the server
rebuilds the same 794px document the portal's own print window produces. **Re-run
`npm run sync:report-css` after any styling change to the portal**, or PDFs will
drift from what physios see on screen.

Rendering uses headless Chromium (`@sparticuz/chromium` on Vercel). If it fails,
`PDF_ENGINE=auto` falls back to Drive's HTML→PDF conversion — readable but mostly
unstyled — and flags it in `warnings`. Set `PDF_ENGINE=chromium` to fail loudly
instead.

**Stored files** are keyed by assessment: `<AssessmentID>/<angle>.jpg` and
`<AssessmentID>/ErgoAssessment-<Customer>-<Date>.pdf` on Supabase, or the same
names flat in the folder on Drive. Both backends overwrite in place on re-sync,
so the link recorded in the sheet stays valid and duplicates don't pile up.
`lib/storage.ts` is the only module that knows which backend is active.

**Auth** is one shared password (`ADMIN_PASSWORD`) exchanged for an HMAC-signed,
HttpOnly cookie. If the variable is unset the dashboard is open and says so in a
banner. The check lives in `app/admin/layout.tsx` rather than middleware, because
the cookie is signed with `node:crypto`.

---

## Layout

```
app/
  api/           submit, photo, assessments, assessment/[id], stats, health, login, logout
  admin/         list, [id] detail, stats
  login/
components/      pills, filter-bar, charts
lib/
  schema.ts      the 62-column contract
  sheet.ts       read + upsert against the Sheets API
  storage.ts     picks the backend; the rest of the app never names one
  supabase.ts    Supabase Storage REST calls
  drive.ts       Drive upload, sharing, HTML→PDF fallback
  pdf.ts         Chromium rendering + the report wrapper
  google.ts      service-account auth, REST helper
  query.ts       filtering, sorting, paging
  stats.ts       dashboard aggregates
  report-css.generated.ts   ← generated, do not edit
portal/index.html          the Netlify portal, syncSheet() patched
reference/                 sheet headers, sample payload, old Apps Script
context/CONTEXT.md         the original handoff spec
scripts/
  init-sheet.mjs           setup + connectivity check
  init-supabase.mjs        create the storage bucket and verify public reads
  get-drive-token.mjs      mint the Drive OAuth refresh token
  extract-report-css.mjs   regenerate the report stylesheet
  test-pdf.mjs             render a sample PDF locally
```

## Notes and limits

- **Request body size.** Vercel caps a serverless request at ~4.5MB. The portal
  compresses photos to 900px / JPEG 0.62 (roughly 60–150KB each), so the combined
  payload normally fits, but the patched `syncSheet()` sends each photo to
  `/api/photo` separately anyway — nothing approaches the cap, and one failed
  upload retries on its own. `/api/submit` still accepts an inline `photos` map
  for compatibility.
- **Concurrent writes.** The upsert is read-then-write with no locking. Two
  syncs for the same assessment landing within the same second could both append.
  The old Apps Script had the same behaviour; a `Purchase`-style dedupe pass on
  the Sheet is the fallback if it ever bites.
- **Storage backend.** `/api/health` reports `storage` as `supabase` or `drive`.
  If it says `drive` when you expected Supabase, the two Supabase variables
  aren't reaching the deployment.
- **Drive quota** (Drive path only). Uploads run as the OAuth account and count against its 15GB.
  Photos are ~60–150KB and a report PDF ~80KB, so roughly 500KB per assessment —
  about 30,000 assessments before that matters.
- **Drive identity.** `/api/health` reports `driveAuth` as `oauth` or
  `service-account`. If it says `service-account` on a personal Google account,
  uploads will 403 — the OAuth variables aren't reaching the deployment.
- **Retry queue.** Failed syncs are queued in `localStorage` under `fec_syncq`
  and flushed on the portal's next load.
