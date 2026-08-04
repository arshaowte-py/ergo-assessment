/**
 * The 62-column sheet contract.
 *
 * This order is authoritative — it matches `reference/sheet_headers.txt` and the
 * HEADERS array in the Apps Script backend that this service replaces, so an
 * existing Assessments tab keeps working unchanged.
 *
 * 57 columns come from the portal's `flatRow()`; the remaining 5 (four photo
 * links + "Last updated") are filled in server-side.
 */
export const HEADERS = [
  "Assessment ID",
  "Stage",
  "Date",
  "Session type",
  "Store / City",
  "Physiotherapist",
  "Customer",
  "Age",
  "Gender",
  "Phone",
  "Email",
  "Occupation",
  "Company",
  "Work mode",
  "Device",
  "Work h/day",
  "Sitting h/day",
  "Screen h/day",
  "Height cm",
  "Weight kg",
  "Conditions",
  "Other conditions",
  "Consent",
  "Photo consent",
  "Reasons",
  "Top pain",
  "All pain",
  "Red flags",
  "Breaks",
  "Sitting bout",
  "Activity",
  "Owns",
  "Setup",
  "Chair ROSA",
  "Section B",
  "Section C",
  "FINAL ROSA",
  "Band",
  "Workspace Q",
  "On-spot",
  "Work changes",
  "Habit changes",
  "Products",
  "Outcome",
  "Order/Invoice",
  "Purchase",
  "Follow-up type",
  "Follow-up date",
  "Voucher",
  "Fee status",
  "Fee amount",
  "Voucher code",
  "Referrals",
  "Photo side",
  "Photo above",
  "Photo back",
  "Photo seated",
  "Photo count",
  "Report PDF",
  "Filled by",
  "Submitted at",
  "Last updated",
] as const;

export type Header = (typeof HEADERS)[number];
export type AssessmentRow = Partial<Record<Header, string | number>>;

/** A1 range covering exactly the 62 columns (A..BJ). */
export const LAST_COLUMN = columnLetter(HEADERS.length);

/** The four photo angles the portal captures, in report order. */
export const PHOTO_ANGLES = ["side", "above", "back", "seated"] as const;
export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

export const PHOTO_HEADERS: Record<PhotoAngle, Header> = {
  side: "Photo side",
  above: "Photo above",
  back: "Photo back",
  seated: "Photo seated",
};

/**
 * Columns that must never be blanked by a later sync.
 *
 * The portal syncs twice: once on submit (no photos, no report) and again on
 * Done (full payload). Without this the first sync's links would be wiped, and
 * on re-opening a saved assessment the portal sends `"Report PDF": ""` verbatim.
 */
export const PRESERVE_IF_EMPTY: Header[] = [
  "Photo side",
  "Photo above",
  "Photo back",
  "Photo seated",
  "Report PDF",
  "Submitted at",
];

export const RISK_BANDS = ["LOW", "MODERATE", "HIGH"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const STAGES = ["Draft", "Submitted", "Report ready"] as const;
export type Stage = (typeof STAGES)[number];

/** 1 -> "A", 27 -> "AA", 62 -> "BJ" */
export function columnLetter(index1Based: number): string {
  let n = index1Based;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Project an object onto the 62-column array the Sheets API expects. */
export function rowToValues(row: AssessmentRow): (string | number)[] {
  return HEADERS.map((h) => {
    const v = row[h];
    return v === undefined || v === null ? "" : v;
  });
}

/** Inflate a raw sheet row (which may be short-tailed) back into an object. */
export function valuesToRow(values: unknown[]): AssessmentRow {
  const row: AssessmentRow = {};
  HEADERS.forEach((h, i) => {
    const v = values[i];
    row[h] = v === undefined || v === null ? "" : (v as string | number);
  });
  return row;
}

/**
 * Drop any keys the portal sends that aren't part of the schema, and coerce
 * everything to a sheet-safe scalar. Keeps a rogue payload from shifting columns.
 */
export function sanitizeRow(input: unknown): AssessmentRow {
  const row: AssessmentRow = {};
  if (!input || typeof input !== "object") return row;
  const src = input as Record<string, unknown>;
  for (const h of HEADERS) {
    if (!(h in src)) continue;
    const v = src[h];
    if (v === null || v === undefined) continue;
    if (typeof v === "number" || typeof v === "string") row[h] = v;
    else if (typeof v === "boolean") row[h] = v ? "Yes" : "No";
    else row[h] = String(v);
  }
  return row;
}

/** Assessment IDs look like FEC-260804-02Y. Used to keep IDs out of file paths. */
export function isValidAssessmentId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(id);
}
