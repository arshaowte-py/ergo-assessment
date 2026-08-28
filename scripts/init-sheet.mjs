#!/usr/bin/env node
/**
 * One-time setup / connectivity check.
 *
 *   npm run init:sheet      (reads .env.local via --env-file)
 *
 * Verifies the service account can reach the Sheet and the Drive folder, writes
 * the 62-column header row if the tab is empty, and reports the row count.
 */
import { JWT } from "google-auth-library";

const HEADERS = [
  "Assessment ID", "Stage", "Date", "Session type", "Store / City", "Physiotherapist",
  "Customer", "Age", "Gender", "Phone", "Email", "Occupation", "Company", "Work mode",
  "Device", "Work h/day", "Sitting h/day", "Screen h/day", "Height cm", "Weight kg",
  "Conditions", "Other conditions", "Consent", "Photo consent",
  "Reasons", "Top pain", "All pain", "Red flags",
  "Breaks", "Sitting bout", "Activity", "Owns", "Setup",
  "Chair ROSA", "Section B", "Section C", "FINAL ROSA", "Band", "Workspace Q",
  "On-spot", "Work changes", "Habit changes",
  "Products", "Outcome", "Order/Invoice", "Purchase",
  "Follow-up type", "Follow-up date", "Voucher",
  "Fee status", "Fee amount", "Voucher code", "Referrals",
  "Photo side", "Photo above", "Photo back", "Photo seated", "Photo count",
  "Report PDF", "Filled by", "Submitted at", "Last updated",
];

const SHEET_ID = process.env.SHEET_ID;
const TAB = process.env.SHEET_TAB || "Assessments";
const FOLDER = process.env.DRIVE_FOLDER_ID;
const EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

const missing = [
  ["GOOGLE_SERVICE_ACCOUNT_EMAIL", EMAIL],
  ["GOOGLE_PRIVATE_KEY", KEY],
  ["SHEET_ID", SHEET_ID],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const auth = new JWT({
  email: EMAIL,
  key: KEY,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

const { token } = await auth.getAccessToken();
const api = async (url, init = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}\n${await res.text()}`);
  return res.json();
};

const S = "https://sheets.googleapis.com/v4/spreadsheets";

// 1. Spreadsheet reachable, tab present?
const meta = await api(`${S}/${SHEET_ID}?fields=properties.title,sheets.properties.title`);
const tabs = meta.sheets.map((s) => s.properties.title);
console.log(`Spreadsheet: ${meta.properties.title}`);
console.log(`Tabs:        ${tabs.join(", ")}`);

if (!tabs.includes(TAB)) {
  console.log(`Creating tab "${TAB}"…`);
  await api(`${S}/${SHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }),
  });
}

// 2. Header row
const head = await api(`${S}/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A1:A1`)}`);
if (!head.values?.[0]?.[0]) {
  await api(
    `${S}/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A1:BJ1`)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [HEADERS] }),
    },
  );
  console.log(`Wrote ${HEADERS.length} headers.`);
} else {
  console.log("Header row already present — left untouched.");
}

const ids = await api(`${S}/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A2:A`)}`);
console.log(`Rows:        ${(ids.values || []).filter((r) => r[0]).length}`);

// 3. Drive folder writable?
if (FOLDER) {
  const folder = await api(
    `https://www.googleapis.com/drive/v3/files/${FOLDER}?fields=id,name,capabilities/canAddChildren&supportsAllDrives=true`,
  );
  console.log(`Drive folder: ${folder.name}`);
  console.log(
    folder.capabilities?.canAddChildren
      ? "Drive folder: writable ✓"
      : "Drive folder: NOT writable — share it with the service account as Editor",
  );
} else {
  console.log("DRIVE_FOLDER_ID not set — photo and PDF uploads will be skipped.");
}

console.log("\nAll checks passed.");
