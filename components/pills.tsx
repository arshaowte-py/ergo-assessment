import { normaliseBand } from "@/lib/format";

const BAND_STYLES: Record<string, string> = {
  LOW: "bg-green-soft text-green",
  MODERATE: "bg-amber-soft text-[#8a5c00]",
  HIGH: "bg-red-soft text-red",
};

export function BandPill({ value }: { value: unknown }) {
  const band = normaliseBand(value);
  if (!band) return <span className="text-slate">—</span>;
  return <span className={`pill ${BAND_STYLES[band]}`}>{band}</span>;
}

const STAGE_STYLES: Record<string, string> = {
  Draft: "bg-paper text-slate",
  Submitted: "bg-blue-soft text-blue",
  "Report ready": "bg-green-soft text-green",
};

export function StagePill({ value }: { value: unknown }) {
  const stage = String(value ?? "").trim();
  if (!stage) return <span className="text-slate">—</span>;
  return (
    <span className={`pill ${STAGE_STYLES[stage] ?? "bg-paper text-slate"}`}>{stage}</span>
  );
}
