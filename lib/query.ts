import { isoDate, normaliseBand, parseSheetDate, toNumber } from "./format";
import { readAllRows } from "./sheet";
import { AssessmentRow } from "./schema";

export type AssessmentFilters = {
  physio?: string;
  store?: string;
  band?: string;
  stage?: string;
  q?: string;
  from?: string;
  to?: string;
};

export type SortKey = "date" | "customer" | "physio" | "store" | "rosa" | "band" | "stage";
export type SortDir = "asc" | "desc";

export function parseFilters(params: URLSearchParams): AssessmentFilters {
  const get = (k: string) => {
    const v = params.get(k);
    return v && v.trim() ? v.trim() : undefined;
  };
  return {
    physio: get("physio"),
    store: get("store"),
    band: get("band"),
    stage: get("stage"),
    q: get("q") ?? get("search"),
    from: get("from"),
    to: get("to"),
  };
}

export function hasActiveFilters(f: AssessmentFilters): boolean {
  return Object.values(f).some(Boolean);
}

function matches(row: AssessmentRow, f: AssessmentFilters): boolean {
  if (f.physio && !equalsLoose(row["Physiotherapist"], f.physio)) return false;
  if (f.store && !equalsLoose(row["Store / City"], f.store)) return false;
  if (f.band && normaliseBand(row["Band"]) !== f.band.toUpperCase()) return false;
  if (f.stage && !equalsLoose(row["Stage"], f.stage)) return false;

  if (f.from || f.to) {
    const d = isoDate(row["Date"]);
    if (!d) return false;
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
  }

  if (f.q) {
    const needle = f.q.toLowerCase();
    const haystack = [
      row["Customer"],
      row["Assessment ID"],
      row["Phone"],
      row["Email"],
      row["Company"],
      row["Occupation"],
    ]
      .map((v) => String(v ?? "").toLowerCase())
      .join(" ");
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function equalsLoose(a: unknown, b: string): boolean {
  return String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

const BAND_RANK: Record<string, number> = { LOW: 1, MODERATE: 2, HIGH: 3 };
const STAGE_RANK: Record<string, number> = { Draft: 1, Submitted: 2, "Report ready": 3 };

function sortValue(row: AssessmentRow, key: SortKey): string | number {
  switch (key) {
    case "date": {
      const d = parseSheetDate(row["Date"]);
      return d ? d.getTime() : 0;
    }
    case "rosa":
      return toNumber(row["FINAL ROSA"]) ?? -1;
    case "band":
      return BAND_RANK[normaliseBand(row["Band"]) || ""] ?? 0;
    case "stage":
      return STAGE_RANK[String(row["Stage"] ?? "")] ?? 0;
    case "customer":
      return String(row["Customer"] ?? "").toLowerCase();
    case "physio":
      return String(row["Physiotherapist"] ?? "").toLowerCase();
    case "store":
      return String(row["Store / City"] ?? "").toLowerCase();
  }
}

export function sortRows(
  rows: AssessmentRow[],
  key: SortKey = "date",
  dir: SortDir = "desc",
): AssessmentRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    // Stable tiebreak so paging doesn't shuffle equal rows.
    return String(a["Assessment ID"] ?? "").localeCompare(String(b["Assessment ID"] ?? ""));
  });
}

export type QueryResult = {
  rows: AssessmentRow[];
  total: number;
  filtered: number;
  limit: number | null;
  offset: number;
  facets: { physios: string[]; stores: string[]; bands: string[]; stages: string[] };
};

export async function queryAssessments(opts: {
  filters?: AssessmentFilters;
  sort?: SortKey;
  dir?: SortDir;
  limit?: number | null;
  offset?: number;
}): Promise<QueryResult> {
  const all = await readAllRows();
  const filters = opts.filters ?? {};
  const filtered = all.filter((r) => matches(r, filters));
  const sorted = sortRows(filtered, opts.sort ?? "date", opts.dir ?? "desc");

  const offset = Math.max(0, opts.offset ?? 0);
  const limit = opts.limit ?? null;
  const page = limit === null ? sorted.slice(offset) : sorted.slice(offset, offset + limit);

  return {
    rows: page,
    total: all.length,
    filtered: filtered.length,
    limit,
    offset,
    facets: buildFacets(all),
  };
}

function buildFacets(rows: AssessmentRow[]): QueryResult["facets"] {
  const uniq = (key: keyof AssessmentRow) =>
    [...new Set(rows.map((r) => String(r[key] ?? "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  return {
    physios: uniq("Physiotherapist"),
    stores: uniq("Store / City"),
    bands: uniq("Band"),
    stages: uniq("Stage"),
  };
}
