# Frido Ergo Assessment Portal — Backend + Admin Dashboard
## Full context for Claude Code

---

## 1. WHAT EXISTS TODAY

### The Portal (frontend)
- **File:** `portal/index.html` — a single-file HTML/CSS/JS web app (1940 lines)
- **Deployed at:** https://frido-ergoassessment.netlify.app/
- **Used by:** Frido physiotherapists on their phones during ergonomic assessments
- **What it does:** 6-step assessment flow → generates a branded PDF report for the customer
  1. Identification (customer details, consent, photo consent)
  2. Habits & Setup (work habits, anthropometrics, conditions, 4 photo captures, fee)
  3. Pain Points (pain areas, severity, body map)
  4. ROSA Score (Rapid Office Strain Assessment — validated clinical tool, score /42 or /10)
  5. Review & Recommendations (on-spot corrections, recommendations, Frido product picks)
  6. Report Builder (auto-drafts editable report → preview → download PDF)

### Current backend (broken, being replaced)
- Google Apps Script web app relay → Google Sheet
- **Problem:** Apps Script's 302 redirect strips the POST body on larger payloads (report HTML ~57KB). Small syncs land; the report PDF and photos never do.
- The Apps Script approach is being abandoned entirely. The new backend replaces it.

### Google resources (keep using these)
- **Sheet ID:** `1wd1dO4vnmGUoP1iYciNKXCwQ6R5CoJCjT2YGrTTHEUo`
- **Sheet tab:** `Assessments`
- **Drive folder ID (photos + PDFs):** `1P3YldSpe8Ib_URDJK0SqfDaUC20R2Qcr`
- Access via a Google Cloud **service account** (Arfa will provide the JSON key)

---

## 2. WHAT TO BUILD

### A. Vercel backend (API routes)

#### `POST /api/submit`
Receives the full assessment payload from the portal. Must handle:
- **Row data** (57 fields — see schema below)
- **Photos** (up to 4 base64 data-URIs, keyed `side`, `above`, `back`, `seated`)
- **Report HTML** (the `#printDoc` innerHTML, ~50-60KB, contains the full styled report)

Processing:
1. Parse the JSON body
2. Upload any photos to the Drive folder → get shareable links
3. Convert reportHTML to PDF (wrap in minimal styles, render to PDF) → upload to Drive → get link
4. Upsert row into the Google Sheet (keyed on "Assessment ID"):
   - If the Assessment ID already exists → update that row (preserve existing photo/PDF links if new ones aren't provided)
   - If new → append
   - Photo links and Report PDF link go into the row
5. Return `{ok:true, id:"FEC-..."}`

**Important:** The portal syncs TWICE per assessment:
- On submit (step 3 → entering physio phase) — small payload, no report HTML, no photos
- On Done (step 6 → assessment complete) — full payload with photos and report HTML
The upsert ensures both land in the same row.

#### `GET /api/assessments`
Returns assessment data for the admin dashboard. Support:
- Optional filters: `?physio=X`, `?store=X`, `?band=X`, `?from=DATE&to=DATE`
- Returns JSON array of row objects
- Paginated if needed (start with returning all, optimize later)

#### `GET /api/assessment/[id]`
Returns a single assessment by Assessment ID, including the photo and PDF links.

### B. Admin Dashboard (frontend pages)

#### `/admin` — Assessment list
- Table of all assessments, sortable/filterable by: date, physio, store, risk band, stage
- Columns to show: Assessment ID, Date, Customer, Physio, Store, ROSA score, Band, Stage, Photo count, Report PDF (clickable link)
- Search by customer name
- Color-code risk bands (green=LOW, amber=MODERATE, red=HIGH)

#### `/admin/[id]` — Assessment detail
- Full assessment details in a readable layout
- Customer photos displayed (from Drive links)
- Clickable Report PDF link (opens in new tab)
- All issues, recommendations, products, follow-up info
- Pain details and ROSA breakdown

#### `/admin/stats` — Summary dashboard (nice to have, can come later)
- Assessments per store/city
- Risk band distribution (pie/bar chart)
- Assessments over time
- Conversion rate (Purchase = "Yes" vs total)
- Top products recommended
- Average ROSA score

### C. Portal patch
Update `syncSheet()` in `portal/index.html` to POST to the Vercel API:
```js
function syncSheet(){
 if(!API_URL) return;
 try{
  const photos={};
  Object.keys(S.photos||{}).forEach(k=>{if(S.photos[k])photos[k]=S.photos[k];});
  let reportHTML="";
  if(S.rep&&S.rep._generated){
   const pd=$("#printDoc");
   if(pd) reportHTML=pd.innerHTML;
  }
  const body=JSON.stringify({
   row:flatRow(),
   photos:photos,
   reportHTML:reportHTML
  });
  fetch(API_URL+"/api/submit",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:body
  }).catch(()=>{ queueSync(body); });
 }catch(e){}
}
```

---

## 3. DATA SCHEMA — 62 columns

These are the exact keys produced by `flatRow()` in the portal, plus the server-side columns.

### From the portal (57 keys):
```
Assessment ID, Stage, Date, Session type, Store / City, Physiotherapist,
Customer, Age, Gender, Phone, Email, Occupation, Company, Work mode, Device,
Work h/day, Sitting h/day, Screen h/day, Height cm, Weight kg,
Conditions, Other conditions, Consent, Photo consent,
Reasons, Top pain, All pain, Red flags,
Breaks, Sitting bout, Activity, Owns, Setup,
Chair ROSA, Section B, Section C, FINAL ROSA, Band, Workspace Q,
Photo count, Report PDF,
Filled by, On-spot, Work changes, Habit changes,
Products, Outcome, Order/Invoice, Purchase,
Follow-up type, Follow-up date, Voucher,
Fee status, Fee amount, Voucher code, Referrals,
Submitted at
```

### Added server-side (5 keys):
```
Photo side    — Drive link to side-angle photo
Photo above   — Drive link to above-angle photo
Photo back    — Drive link to back-angle photo
Photo seated  — Drive link to seated-angle photo
Last updated  — server timestamp
```

### Field details for the admin dashboard:
- **Stage:** "Submitted" | "Report ready"
- **Band:** "LOW" | "MODERATE" | "HIGH"
- **FINAL ROSA:** numeric score (out of 10 or out of 42 depending on scoring version)
- **Products:** semicolon-separated, format: `1) Product Name [intent]`
- **All pain:** semicolon-separated, format: `Area Score/10 (duration)`
- **Photo count:** format: `n/4`
- **On-spot / Work changes / Habit changes:** semicolon-separated lists
- **Conditions:** semicolon-separated list of medical conditions

---

## 4. TECH DECISIONS

- **Deployment:** Vercel (free tier)
- **Framework:** Next.js (API routes + pages in one project)
- **Google APIs:** Use `googleapis` npm package with service account auth
  - Sheets API v4 for read/write
  - Drive API v3 for photo upload, PDF upload, sharing
- **PDF generation:** Use the reportHTML with embedded styles, convert server-side
  - Option 1: `puppeteer` (heavy but accurate rendering)
  - Option 2: Google Drive's HTML-to-PDF conversion via `Utilities.newBlob().getAs()` equivalent
  - Option 3: `html-pdf-node` or similar lightweight library
  - Recommendation: Start with a lightweight lib; Puppeteer is heavy for Vercel serverless
- **Admin UI:** Simple, clean — can use Tailwind + shadcn/ui or just plain Tailwind
- **Auth for admin:** Start with a simple shared password or env-var-based gate; can add proper auth later
- **CORS:** Enable for the portal domain (https://frido-ergoassessment.netlify.app)

---

## 5. FILE INVENTORY IN THIS ZIP

```
context/
  CONTEXT.md          ← this file (the master spec)

portal/
  index.html          ← the current portal (latest version with all fixes)
                         This is the file deployed on Netlify.
                         syncSheet() needs to be patched to point at the new Vercel API.

reference/
  old-appscript-Code.gs  ← the Apps Script backend being replaced (for reference only)
  sheet_headers.txt       ← tab-separated header row (62 columns)
  sample-flatrow.json     ← example flatRow() output from the portal
  portal-state-schema.json← the blank() state object showing all fields the portal captures
```

---

## 6. PORTAL INTERNALS (for Claude Code reference)

### State object
The portal stores everything in a single `S` object (initialized by `blank()`). Key paths:
- `S.cust` — customer details (name, phone, email, age, gender, occupation, company)
- `S.meta` — assessment meta (id, date, physio, session type, store)
- `S.consent` / `S.photoConsent` — boolean consent flags
- `S.rosa` — ROSA scoring (a1-a4, b1-b2, c1-c2, each with base pick and modifiers)
- `S.pain` — array of {area, score, dur, side, notes}
- `S.photos` — {side: dataURI, above: dataURI, back: dataURI, seated: dataURI}
- `S.photoNotes` — {side: [{x,y,text},...], ...} — annotation pins on photos
- `S.acts` — {onspot:[], work:[], habit:[], workOther, habitOther}
- `S.picks` — array of product names; `S.intent` — {productName: "will buy"|"deciding"|...}
- `S.rep` — the drafted report object (primary concern, findings, issues, exercises, etc.)
- `S.rep._generated` — flag set when report has been built

### Report generation flow
1. `draftReport()` — auto-generates `S.rep` from assessment data
2. `renderReportEditor()` — renders editable cards in Step 6
3. `buildPrintDoc()` — renders the final branded report HTML into `#printDoc`
4. `openPrintWindow()` — opens a new window with the report at 794px width for PDF download

### Sync points
- `submitInputs()` (step 3 → step 4 transition) — calls `syncSheet()`
- `finishAssessment()` (Done button on step 6) — calls `buildPrintDoc()` then `syncSheet()`
- Preview button — calls `buildPrintDoc()` then `syncSheet()` then opens overlay

---

## 7. IMPORTANT CONSTRAINTS

- **Arfa runs all git commands herself.** Claude Code must never run git commands (no checkout, add, commit, push, status, restore, stash, diff).
- The portal is a single HTML file. Keep it that way — don't refactor it into a framework.
- The portal is deployed on Netlify separately from the backend. They're different repos/deploys.
- The Google Sheet is the database. Don't introduce a separate DB — the admin dashboard reads from the same Sheet.
- Photos are base64 data-URIs in the portal state. They can be large (phone camera photos). The backend must handle payloads up to ~10MB.
- The Report PDF filename format is: `ErgoAssessment-CustomerName-Date.pdf`

---

## 8. ENV VARS NEEDED ON VERCEL

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
SHEET_ID=1wd1dO4vnmGUoP1iYciNKXCwQ6R5CoJCjT2YGrTTHEUo
SHEET_TAB=Assessments
DRIVE_FOLDER_ID=1P3YldSpe8Ib_URDJK0SqfDaUC20R2Qcr
ADMIN_PASSWORD=<set something>
API_SECRET=<optional, for portal auth>
```
