# Frido Care — Ergonomic Assessment module

`ergo-assessment.html` is the six-step ergonomic assessment, packaged to drop
into the Frido Care app as the **Care Services** section. One self-contained
file: no build step, no framework, no runtime dependencies. The only network
calls it makes are the Google font stylesheet and — if you configure one — the
assessment API.

---

## 1. Embedding

Set `window.FRIDO_CARE_CONFIG` **before** the file's own script runs, then load
the file. Every key is optional and falls back to standalone behaviour.

```html
<script>
  window.FRIDO_CARE_CONFIG = {
    apiUrl: "https://ergo-assessment.vercel.app", // "" turns cloud sync off
    apiSecret: "",                                // must match API_SECRET on the backend
    storagePrefix: "fridocare_ergo",              // namespaces localStorage
    embedded: true                                // hides the standalone header
  };
  window.FRIDO_FONT_BASE = "/assets/fonts";       // see Brand theme below
</script>
```

| Key | Default | What it does |
|---|---|---|
| `apiUrl` | `""` | Backend base URL, no trailing slash. Empty means the assessment runs fully offline and saves only to the device. |
| `apiSecret` | `""` | Sent as `token`. Only needed if the backend sets `API_SECRET`. |
| `storagePrefix` | `"fec"` | Prefix for the three localStorage keys (`_current_v2`, `_saved_v2`, `_syncq`). **Change this** so drafts can't collide with Frido Care's own keys. |
| `embedded` | `false` | Hides the module's own header so the host app supplies the chrome. |

### Iframe or inline?

**Iframe is the safer default.** The module ships ~1,400 lines of CSS written
for a standalone page, including bare-element rules (`input`, `button`, `body`).
Inlined into an existing app those will leak into the host's styles and the
host's reset will leak back in.

```html
<iframe src="/care/ergo-assessment.html" style="width:100%;height:100dvh;border:0"
        allow="camera" title="Ergonomic assessment"></iframe>
```

`allow="camera"` matters — Step 2 captures four posture photos through
`<input type="file" capture="environment">`, which is blocked in a sandboxed
iframe without it.

To pass config into an iframe, either write the `<script>` block into the
document you serve, or append query params and read them at the top of the file.

Inline it only if you first scope the stylesheet (wrap the CSS in a cascade
layer or prefix every selector) — not a five-minute job.

---

## 2. Brand theme — audited against Brand Book 2024

Tokens are now taken from the book rather than inherited. Every value lives once
on `:root`; restyling starts and ends there.

### Colour: what the book says vs what the app had

| Token | Was | Now | Source |
|---|---|---|---|
| `--navy` / `--ink` | `#101820` | `#101820` | ✅ Primary, Pantone Black 6 C |
| `--card` | `#FFFFFF` | `#FFFFFF` | ✅ Primary |
| `--brand` | `#FFD100` | `#FFD100` | ✅ Primary, Pantone 109 C |
| `--blue` | `#307FE2` | `#307FE2` | ✅ Secondary, Pantone 2727 C |
| `--line` | `#DDE3E8` | `#DDE5ED` | Was close but off — now Pantone 656 C exactly |
| `--navy2` | `#2B3A46` | `#333F48` | Was invented — now Pantone 432 C |
| `--amber` | `#F5A300` | `#DB864E` | **Was not in the book at all** — now Pantone 7576 C |
| `--green` | `#2E9E5B` | `#2E7D55` | Darkened Pantone 353 C — see below |
| `--red` | `#C0392B` | `#D64A50` | Darkened Pantone 178 C — see below |
| `--slate` | `#5C6B77` | `#5A6570` | Lightened Pantone 432 C |

Also added: `--blue-2` `#5C88DA` (2718 C) and `--blue-light` `#6CACE4` (284 C),
which the book lists and the app never used.

### Two deliberate departures

Both stay inside a book hue family; neither is a free invention.

**Risk bands.** Measured on white, the book's mint `#80E0A7` is **1.60:1** and
the brand yellow `#FFD100` is **1.46:1**. Neither is legible as clinical status
text or as a chart fill — WCAG wants 4.5:1 for text and 3:1 for fills. So the
band colours are those same hues darkened to ≥4.2:1, and the pale book tints are
used as the pill backgrounds behind them. Brand hue preserved, reading
preserved.

**`--slate`.** `#333F48` at 10.8:1 is nearly as dark as body copy, which
flattens the hierarchy on a form this dense. Helper text uses a lightened step
of the same colour; `#333F48` itself is `--navy2`.

### Type

The book names **Gilroy primary** and **Outfit secondary**, which is exactly the
`'Gilroy','Outfit'` stack the app already declared — but **only Outfit was ever
loaded**, so headings have silently rendered in the secondary face since day
one. Gilroy is licensed and cannot come from Google Fonts:

1. Put `Gilroy-Bold.woff2` and `Gilroy-ExtraBold.woff2` where your app serves static files.
2. Set `window.FRIDO_FONT_BASE` to that directory.

The `@font-face` rules are generated at load. Leave it unset and the file
behaves as before, so this is safe to ship ahead of the font files. The book
notes Regular/Medium/Bold are the working weights and Light/Italic are for
special instances — the app only uses Bold and ExtraBold for display, which fits.

A duplicated `'Gilroy','Outfit','Gilroy','Outfit'` stack was also cleaned up.

## 3. Flow: what was repeating, and what changed

Two questions were being asked twice. Both are now derived and shown as
pre-filled, and in both cases an explicit answer still wins — the logic only
ever fills a blank.

### ROSA durations, already answered in Step 1

Step 1 captures **sitting h/day** and **screen h/day** as numbers. Step 4 then
asked "Time in this chair" and "Screen use" again, as `< 1 h` / `1–4 h` /
`> 4 h` buckets. Those buckets are a strictly coarser version of a number the
customer already gave, so the second ask adds nothing — and lets the two screens
disagree, which matters because both feed the ROSA score.

`durA` and `durMon` are now derived from Step 1. `durPhone`, `durMouse` and
`durKey` are genuinely new information and are still asked.

> **−2 taps per assessment**, and one class of contradictory-input bug removed.

### "Filled by", asked three times

Asked separately for *details*, *habits* and *postural*. One person fills all
three in practice. Step 1's answer now carries forward to any section still
blank, labelled "same as Step 1".

> **−2 taps per assessment.**

### What was left alone, deliberately

- **Three pain captures in Step 3** — reason for visit, the body map, and the
  pain list — look redundant but are not. The reason is why the customer came,
  the map is where, and the list carries severity and duration. They feed
  different parts of the report.
- **Step 5 "Inputs at a glance" and the Step 6 report draft** re-display earlier
  answers but never re-ask them. That is review, not repetition, and it is where
  the physio catches mistakes.
- **The four photo angles** are each scored differently by ROSA.

Net: four fewer interactions per assessment with no loss of captured data.

---

## 4. Data out

With `apiUrl` set, the module posts to the backend at two points — entering the
physio phase, and on Done. Both land in the **same row**, keyed on Assessment ID.

| Endpoint | Payload |
|---|---|
| `POST {apiUrl}/api/submit` | `{ token, row, reportHTML }` — 57 flat fields plus the report markup |
| `POST {apiUrl}/api/photo` | `{ token, id, angle, dataUrl }` — one photo per request |

Photos go one per request so no payload approaches the serverless body limit and
a single failed upload retries on its own. Failed posts queue in
`localStorage` under `{storagePrefix}_syncq` and flush on next load.

The backend writes a row to Google Sheets and stores photos and the rendered PDF
in Supabase Storage (or Google Drive). Nothing about that is visible to this
module — it only needs the URL.

**Offline is a supported state.** With `apiUrl` empty the assessment works end
to end and saves to the device; the physio can still generate and download the
PDF. Useful for in-store tablets with unreliable connectivity.

---

## 5. Before you ship

- [ ] Set `storagePrefix` to something Frido Care-specific.
- [ ] Add `allow="camera"` if you iframe it, or photo capture silently fails.
- [ ] Drop in the Gilroy woff2 files and set `FRIDO_FONT_BASE`. Until then headings
      render in Outfit — the book's *secondary* face — which is the one visible
      brand gap left in this build.
- [ ] Decide iframe vs inline. If inline, scope the CSS first.
- [ ] Point `apiUrl` at the backend and add the Frido Care origin to
      `ALLOWED_ORIGINS` on it, or the browser blocks the cross-origin POSTs.
- [ ] Confirm consent copy in Step 1 matches what Frido Care shows elsewhere —
      the module collects name, phone, email, health conditions and photographs.

## 6. Known constraints

- **Report PDF** is produced by opening a print window at 794px. iOS in-app
  webviews sometimes block `window.open`; test inside the real Frido Care shell,
  not just mobile Safari.
- **Photos are compressed client-side** to 900px / JPEG 0.62 before upload.
- **localStorage holds up to 80 saved assessments**, then drops the oldest.
- **No authentication.** Anyone who can open the page can start an assessment.
  If Frido Care already knows who the physio is, pass it in and pre-fill the
  physiotherapist name rather than relying on typing.
