import { env } from "./env";
import { googleFetch, SHEETS_BASE } from "./google";
import {
  AssessmentRow,
  HEADERS,
  LAST_COLUMN,
  PHOTO_ANGLES,
  PHOTO_HEADERS,
  PRESERVE_IF_EMPTY,
  rowToValues,
  valuesToRow,
} from "./schema";

const DATA_RANGE = () => `${env.sheetTab}!A1:${LAST_COLUMN}`;
const ID_RANGE = () => `${env.sheetTab}!A2:A`;

function encodeRange(range: string): string {
  return encodeURIComponent(range);
}

type ValueRange = { values?: unknown[][] };

/** Every data row, newest-first is NOT applied here — callers sort. */
export async function readAllRows(): Promise<AssessmentRow[]> {
  const res = await googleFetch<ValueRange>(
    `${SHEETS_BASE}/${env.sheetId}/values/${encodeRange(DATA_RANGE())}`,
    { query: { majorDimension: "ROWS", valueRenderOption: "UNFORMATTED_VALUE" } },
  );
  const rows = res.values ?? [];
  if (rows.length <= 1) return [];
  // rows[0] is the header row; trust HEADERS order over whatever is in the sheet
  // so a manually reordered sheet can't silently scramble the mapping.
  return rows.slice(1).filter(hasContent).map(valuesToRow);
}

function hasContent(values: unknown[]): boolean {
  return values.some((v) => v !== "" && v !== null && v !== undefined);
}

export async function findRowById(
  id: string,
): Promise<{ row: AssessmentRow; rowNumber: number } | null> {
  const index = await readIdIndex();
  const rowNumber = index.get(id);
  if (!rowNumber) return null;
  const res = await googleFetch<ValueRange>(
    `${SHEETS_BASE}/${env.sheetId}/values/${encodeRange(
      `${env.sheetTab}!A${rowNumber}:${LAST_COLUMN}${rowNumber}`,
    )}`,
    { query: { valueRenderOption: "UNFORMATTED_VALUE" } },
  );
  const values = res.values?.[0];
  if (!values) return null;
  return { row: valuesToRow(values), rowNumber };
}

/** Map of Assessment ID -> 1-based sheet row number. Last write wins on dupes. */
async function readIdIndex(): Promise<Map<string, number>> {
  const res = await googleFetch<ValueRange>(
    `${SHEETS_BASE}/${env.sheetId}/values/${encodeRange(ID_RANGE())}`,
    { query: { majorDimension: "ROWS" } },
  );
  const map = new Map<string, number>();
  (res.values ?? []).forEach((r, i) => {
    const id = r?.[0];
    if (typeof id === "string" && id) map.set(id, i + 2);
  });
  return map;
}

/**
 * Insert or update one assessment, keyed on "Assessment ID".
 *
 * On update, columns listed in PRESERVE_IF_EMPTY keep their existing value when
 * the incoming payload leaves them blank — that's what lets the portal's first
 * (photo-less, report-less) sync and its final sync share one row.
 */
export async function upsertRow(
  incoming: AssessmentRow,
): Promise<{ action: "created" | "updated"; rowNumber: number; row: AssessmentRow }> {
  const id = String(incoming["Assessment ID"] ?? "").trim();
  if (!id) throw new Error('Payload is missing "Assessment ID"');

  await ensureHeaders();
  const existing = await findRowById(id);

  if (!existing) {
    const created: AssessmentRow = {
      ...incoming,
      "Photo count": `${countPhotoLinks(incoming)}/4`,
    };
    const values = rowToValues(created);
    const res = await googleFetch<{ updates?: { updatedRange?: string } }>(
      `${SHEETS_BASE}/${env.sheetId}/values/${encodeRange(DATA_RANGE())}:append`,
      {
        method: "POST",
        query: {
          // RAW, not USER_ENTERED: Sheets would otherwise coerce "3/4" (the
          // Photo count format) into the date 3 April, and phone numbers into
          // floats. Everything the portal sends is already display-ready.
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          includeValuesInResponse: false,
        },
        json: { values: [values] },
      },
    );
    const rowNumber = parseRowNumber(res.updates?.updatedRange) ?? 0;
    return { action: "created", rowNumber, row: valuesToRow(values) };
  }

  // The portal always sends all 57 of its keys, so a blank there genuinely means
  // "not captured" and should overwrite. The exceptions are the columns the
  // server owns (photo + PDF links): a photo-less sync must not wipe them.
  const merged: AssessmentRow = { ...existing.row, ...incoming };
  for (const h of PRESERVE_IF_EMPTY) {
    if (isBlank(incoming[h]) && !isBlank(existing.row[h])) merged[h] = existing.row[h];
  }
  merged["Photo count"] = `${countPhotoLinks(merged)}/4`;

  const values = rowToValues(merged);
  await googleFetch(
    `${SHEETS_BASE}/${env.sheetId}/values/${encodeRange(
      `${env.sheetTab}!A${existing.rowNumber}:${LAST_COLUMN}${existing.rowNumber}`,
    )}`,
    {
      method: "PUT",
      query: { valueInputOption: "RAW" },
      json: { values: [values] },
    },
  );
  return { action: "updated", rowNumber: existing.rowNumber, row: valuesToRow(values) };
}

/** Authoritative photo count — derived from the links actually in the row. */
export function countPhotoLinks(row: AssessmentRow): number {
  return PHOTO_ANGLES.filter((a) => !isBlank(row[PHOTO_HEADERS[a]])).length;
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

function parseRowNumber(range?: string): number | null {
  if (!range) return null;
  const m = range.match(/![A-Z]+(\d+)/);
  return m ? Number(m[1]) : null;
}

let headersChecked = false;

/** Writes the header row once per warm instance if the tab is empty. */
export async function ensureHeaders(force = false): Promise<void> {
  if (headersChecked && !force) return;
  const res = await googleFetch<ValueRange>(
    `${SHEETS_BASE}/${env.sheetId}/values/${encodeRange(`${env.sheetTab}!A1:A1`)}`,
  );
  const firstCell = res.values?.[0]?.[0];
  if (!firstCell) {
    await googleFetch(
      `${SHEETS_BASE}/${env.sheetId}/values/${encodeRange(
        `${env.sheetTab}!A1:${LAST_COLUMN}1`,
      )}`,
      {
        method: "PUT",
        query: { valueInputOption: "RAW" },
        json: { values: [HEADERS as unknown as string[]] },
      },
    );
  }
  headersChecked = true;
}

/** Health check: does the tab exist and how many rows does it hold? */
export async function sheetStatus(): Promise<{ tab: string; rows: number }> {
  const res = await googleFetch<ValueRange>(
    `${SHEETS_BASE}/${env.sheetId}/values/${encodeRange(ID_RANGE())}`,
  );
  return { tab: env.sheetTab, rows: (res.values ?? []).filter((r) => r?.[0]).length };
}
