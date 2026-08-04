import { convertHtmlToPdfViaDrive } from "./drive";
import { env } from "./env";
import { PORTAL_CSS } from "./report-css.generated";

/**
 * The portal's own print window (openPrintWindow()) lays the report out at
 * 794px — A4 width at 96dpi — with the portal's stylesheet applied. We rebuild
 * that same document server-side so the stored PDF matches what the physio
 * previewed on the device.
 */
export function wrapReportHtml(reportHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=794">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${PORTAL_CSS}
html,body{background:#fff;margin:0;padding:0}
#printDoc{width:794px;max-width:794px;margin:0 auto;box-shadow:none;padding:30px 36px;font-size:12px}
@page{size:A4;margin:12mm}
@media print{#printDoc{width:100%;padding:0;font-size:11.5px}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sec,.pgrid figure,table{break-inside:avoid;page-break-inside:avoid}
</style></head>
<body><div id="printDoc">${reportHtml}</div></body></html>`;
}

/**
 * Minimal styling for the Drive fallback. Google Docs import ignores most CSS,
 * so we keep it to the handful of rules that survive.
 */
function wrapReportHtmlPlain(reportHtml: string, title: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#2A3540;font-size:12px;line-height:1.5;margin:24px}
h1,h2,h3{color:#1F3A5F}
table{width:100%;border-collapse:collapse;margin:8px 0}
td,th{border:1px solid #E4EAF0;padding:6px 8px;text-align:left;vertical-align:top;font-size:11px}
.pgrid figure{margin:0 0 10px}
.pgrid img{width:100%;border:1px solid #E4EAF0}
</style></head><body>${reportHtml}</body></html>`;
}

export type PdfResult = { buffer: Buffer; engine: "chromium" | "drive" };

/**
 * Render the report to PDF.
 *
 * Chromium (via @sparticuz/chromium on Vercel) is the accurate path. Drive's
 * HTML->Doc->PDF converter is the no-binary fallback; it loses most styling but
 * always produces a readable document. PDF_ENGINE pins one or the other.
 */
export async function renderReportPdf(
  reportHtml: string,
  title: string,
): Promise<PdfResult> {
  const engine = env.pdfEngine;

  if (engine !== "drive") {
    try {
      const buffer = await renderWithChromium(wrapReportHtml(reportHtml, title));
      return { buffer, engine: "chromium" };
    } catch (err) {
      if (engine === "chromium") throw err;
      console.warn(
        "[pdf] chromium render failed, falling back to Drive conversion:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const buffer = await convertHtmlToPdfViaDrive(wrapReportHtmlPlain(reportHtml, title));
  return { buffer, engine: "drive" };
}

async function renderWithChromium(html: string): Promise<Buffer> {
  const [{ default: chromium }, puppeteer] = await Promise.all([
    import("@sparticuz/chromium"),
    import("puppeteer-core"),
  ]);

  const executablePath =
    process.env.CHROMIUM_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (await chromium.executablePath());

  const browser = await puppeteer.default.launch({
    args: chromium.args,
    defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    // The report embeds photos as data-URIs, so nothing external has to load
    // except the webfont; `networkidle0` with a short timeout covers both.
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 25_000 });
    await page.evaluateHandle("document.fonts.ready").catch(() => undefined);
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** `ErgoAssessment-CustomerName-Date.pdf`, as specified in the handoff. */
export function reportFileName(customer: string, date: string, id: string): string {
  const safeName = sanitizeSegment(customer) || "Customer";
  const safeDate = sanitizeSegment(date) || sanitizeSegment(id) || "undated";
  return `ErgoAssessment-${safeName}-${safeDate}.pdf`;
}

function sanitizeSegment(value: string | number | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
