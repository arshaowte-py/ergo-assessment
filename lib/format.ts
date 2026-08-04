import { AssessmentRow, PHOTO_ANGLES, PHOTO_HEADERS, PhotoAngle, RiskBand } from "./schema";

/** Split the portal's `"a; b; c"` lists back into an array. */
export function splitList(value: unknown): string[] {
  return String(value ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type ProductPick = { rank: number; name: string; intent: string };

/** `"1) Lumbar / Back Support [will buy]"` -> structured pick. */
export function parseProducts(value: unknown): ProductPick[] {
  return splitList(value).map((entry, i) => {
    const m = entry.match(/^\s*(\d+)\)\s*(.*?)\s*(?:\[([^\]]*)\])?\s*$/);
    if (!m) return { rank: i + 1, name: entry, intent: "" };
    return { rank: Number(m[1]) || i + 1, name: m[2], intent: (m[3] ?? "").trim() };
  });
}

export type PainEntry = { area: string; score: number | null; duration: string };

/** `"Lower back 6/10 (1-3 months)"` -> structured pain entry. */
export function parsePain(value: unknown): PainEntry[] {
  return splitList(value).map((entry) => {
    const m = entry.match(/^(.*?)\s+(\d+|\?)\/10(?:\s*\(([^)]*)\))?\s*$/);
    if (!m) return { area: entry, score: null, duration: "" };
    return {
      area: m[1].trim(),
      score: m[2] === "?" ? null : Number(m[2]),
      duration: (m[3] ?? "").trim(),
    };
  });
}

/** `"details:-; habits:-; rosa:Physiotherapist"` -> key/value pairs. */
export function parseKeyed(value: unknown): { key: string; value: string }[] {
  return splitList(value)
    .map((entry) => {
      const i = entry.indexOf(":");
      if (i === -1) return { key: entry, value: "" };
      return { key: entry.slice(0, i).trim(), value: entry.slice(i + 1).trim() };
    })
    .filter((kv) => kv.value && kv.value !== "-");
}

export function photoLinks(row: AssessmentRow): { angle: PhotoAngle; url: string }[] {
  return PHOTO_ANGLES.map((angle) => ({
    angle,
    url: String(row[PHOTO_HEADERS[angle]] ?? "").trim(),
  })).filter((p) => p.url);
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && String(value ?? "").trim() !== "" ? n : null;
}

export function normaliseBand(value: unknown): RiskBand | "" {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "LOW" || v === "MODERATE" || v === "HIGH" ? v : "";
}

/**
 * Sheet dates arrive either as ISO strings from the portal or, if someone has
 * reformatted the column, as a Google serial number. Handle both.
 */
export function parseSheetDate(value: unknown): Date | null {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") {
    // Sheets serial epoch is 1899-12-30.
    const ms = Math.round((value - 25569) * 86_400_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `YYYY-MM-DD` for comparisons and display, without timezone drift. */
export function isoDate(value: unknown): string {
  const d = parseSheetDate(value);
  if (!d) return String(value ?? "").trim();
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(value: unknown): string {
  const d = parseSheetDate(value);
  if (!d) return String(value ?? "");
  return d.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function displayValue(value: unknown): string {
  const s = String(value ?? "").trim();
  return s === "" ? "—" : s;
}
