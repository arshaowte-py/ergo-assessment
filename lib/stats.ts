import { isoDate, normaliseBand, parseProducts, toNumber } from "./format";
import { AssessmentRow, RISK_BANDS } from "./schema";

export type Counted = { label: string; count: number };

export type Stats = {
  total: number;
  withReport: number;
  reportRate: number;
  averageRosa: number | null;
  rosaSampleSize: number;
  conversion: { purchased: number; answered: number; rate: number };
  bands: Counted[];
  stores: Counted[];
  physios: Counted[];
  stages: Counted[];
  products: Counted[];
  overTime: { month: string; count: number }[];
  photoCoverage: { withAllFour: number; withAny: number };
  feeCollected: number;
};

export function computeStats(rows: AssessmentRow[]): Stats {
  const total = rows.length;

  const rosaValues = rows
    .map((r) => toNumber(r["FINAL ROSA"]))
    .filter((n): n is number => n !== null && n > 0);

  const purchaseAnswers = rows
    .map((r) => String(r["Purchase"] ?? "").trim().toLowerCase())
    .filter(Boolean);
  const purchased = purchaseAnswers.filter((v) => v === "yes").length;

  const withReport = rows.filter((r) => String(r["Report PDF"] ?? "").trim()).length;

  const photoCounts = rows.map((r) => {
    const m = String(r["Photo count"] ?? "").match(/^(\d+)\s*\/\s*4$/);
    return m ? Number(m[1]) : 0;
  });

  const fee = rows.reduce((sum, r) => {
    const paid = String(r["Fee status"] ?? "").trim().toLowerCase();
    const amount = toNumber(r["Fee amount"]) ?? 0;
    // Only count fees that were actually collected, not the default 499 sitting
    // on every draft row.
    return paid && paid !== "not collected" && paid !== "waived" ? sum + amount : sum;
  }, 0);

  return {
    total,
    withReport,
    reportRate: total ? withReport / total : 0,
    averageRosa: rosaValues.length
      ? Math.round((rosaValues.reduce((a, b) => a + b, 0) / rosaValues.length) * 10) / 10
      : null,
    rosaSampleSize: rosaValues.length,
    conversion: {
      purchased,
      answered: purchaseAnswers.length,
      rate: purchaseAnswers.length ? purchased / purchaseAnswers.length : 0,
    },
    bands: bandCounts(rows),
    stores: countBy(rows, (r) => String(r["Store / City"] ?? "").trim()),
    physios: countBy(rows, (r) => String(r["Physiotherapist"] ?? "").trim()),
    stages: countBy(rows, (r) => String(r["Stage"] ?? "").trim()),
    products: topProducts(rows, 10),
    overTime: byMonth(rows),
    photoCoverage: {
      withAllFour: photoCounts.filter((c) => c >= 4).length,
      withAny: photoCounts.filter((c) => c > 0).length,
    },
    feeCollected: fee,
  };
}

/** Bands always render in severity order, including zero-count bands. */
function bandCounts(rows: AssessmentRow[]): Counted[] {
  const counts = new Map<string, number>(RISK_BANDS.map((b) => [b, 0]));
  for (const r of rows) {
    const band = normaliseBand(r["Band"]);
    if (band) counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  return RISK_BANDS.map((b) => ({ label: b, count: counts.get(b) ?? 0 }));
}

function countBy(rows: AssessmentRow[], key: (r: AssessmentRow) => string): Counted[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function topProducts(rows: AssessmentRow[], limit: number): Counted[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const p of parseProducts(r["Products"])) {
      if (!p.name) continue;
      counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Assessments per calendar month, gap-filled so the trend line has no holes. */
function byMonth(rows: AssessmentRow[]): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const iso = isoDate(r["Date"]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    const month = iso.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const months = [...counts.keys()].sort();
  if (!months.length) return [];

  const out: { month: string; count: number }[] = [];
  const [startY, startM] = months[0].split("-").map(Number);
  const [endY, endM] = months[months.length - 1].split("-").map(Number);
  const cursor = new Date(Date.UTC(startY, startM - 1, 1));
  const end = new Date(Date.UTC(endY, endM - 1, 1));
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 7);
    out.push({ month: key, count: counts.get(key) ?? 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}
