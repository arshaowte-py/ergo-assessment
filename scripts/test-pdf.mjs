#!/usr/bin/env node
/**
 * Smoke-test the PDF pipeline against a representative report fragment,
 * without needing Google credentials.
 *
 *   CHROMIUM_EXECUTABLE_PATH=/path/to/chrome node scripts/test-pdf.mjs [out.pdf]
 *
 * On Vercel the executable comes from @sparticuz/chromium instead; this script
 * only exists to prove the CSS wrapper and page setup are sane locally.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.cwd(), process.argv[2] ?? "report-test.pdf");

// Pull the frozen CSS straight out of the generated module.
const generated = readFileSync(resolve(root, "lib/report-css.generated.ts"), "utf8");
const match = generated.match(/export const PORTAL_CSS = ("(?:[^"\\]|\\.)*");/s);
if (!match) throw new Error("Could not read PORTAL_CSS — run npm run sync:report-css");
const PORTAL_CSS = JSON.parse(match[1]);

const REPORT = `
<div class="pbrand"><div class="l">Frido<b>.</b></div>
  <div class="r"><h1>ERGONOMIC ASSESSMENT</h1><div>Report generated 2026-08-04</div></div></div>
<div class="meta">
  <div><div class="k">Customer</div><div class="v">Rohit Deshmukh</div></div>
  <div><div class="k">Assessment ID</div><div class="v">FEC-260804-02Y</div></div>
  <div><div class="k">Physiotherapist</div><div class="v">Dr. Ankita Sharma, PT</div></div>
  <div><div class="k">Store</div><div class="v">Andheri West, Mumbai</div></div>
</div>
<div class="snap"><div class="k">ROSA Score</div>
  <div class="scorow"><span class="num">6</span><span class="den">/10</span>
    <span class="pill MODERATE">MODERATE</span></div>
  <div class="snapline"><span class="lbl">Primary concern:</span> Lower back pain from prolonged unsupported sitting.</div>
</div>
<div class="sec"><span class="n">01</span><h2>Findings</h2><small>Observed on site</small></div>
<table><thead><tr><th>Area</th><th>Score</th><th>Duration</th></tr></thead>
<tbody>
  <tr><td>Lower back</td><td>6/10</td><td>1-3 months</td></tr>
  <tr><td>Neck</td><td>4/10</td><td>1-4 weeks</td></tr>
</tbody></table>
<div class="pointers"><div class="k">Workstation changes</div>
  <ul><li>Raise screen to eye level</li><li>Add lumbar support at belt line</li></ul></div>
<div class="sec"><span class="n">02</span><h2>Recommended products</h2></div>
<ul class="fblist"><li><b>1)</b> Lumbar / Back Support</li><li><b>2)</b> Ultimate Wedge Plus Cushion</li></ul>
`;

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=794"><title>ErgoAssessment-Test</title>
<style>
${PORTAL_CSS}
html,body{background:#fff;margin:0;padding:0}
#printDoc{width:794px;max-width:794px;margin:0 auto;box-shadow:none;padding:30px 36px;font-size:12px}
@page{size:A4;margin:12mm}
@media print{#printDoc{width:100%;padding:0;font-size:11.5px}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sec,.pgrid figure,table{break-inside:avoid;page-break-inside:avoid}
</style></head><body><div id="printDoc">${REPORT}</div></body></html>`;

const executablePath =
  process.env.CHROMIUM_EXECUTABLE_PATH ??
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
});

try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0", timeout: 25_000 });
  await page.evaluateHandle("document.fonts.ready").catch(() => undefined);
  const pdf = await page.pdf({
    format: "a4",
    printBackground: true,
    margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
  });
  writeFileSync(out, pdf);
  console.log(`Wrote ${out} (${pdf.length.toLocaleString()} bytes)`);
} finally {
  await browser.close();
}
