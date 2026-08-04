import { Counted } from "@/lib/stats";

/*
 * Charts are plain HTML tables with the bar drawn inside a cell. That keeps
 * every value directly labelled and readable by a screen reader without a
 * separate "table view", and needs no client-side JS.
 *
 * Band fills are a status palette validated against the light chart surface
 * (six checks pass: lightness band, chroma floor, CVD separation, normal-vision
 * separation, contrast). They are always accompanied by the band name, never
 * carried by colour alone.
 */
export const BAND_FILL: Record<string, string> = {
  LOW: "#1F7A44",
  MODERATE: "#C77F00",
  HIGH: "#C0392B",
};

/** Single hue for magnitude — one measure, one colour, no legend needed. */
const MAGNITUDE_FILL = "#307FE2";

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-navy">
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-slate">{hint}</div> : null}
    </div>
  );
}

export function BarList({
  title,
  data,
  fills,
  unit = "",
  emptyMessage = "No data yet.",
  max: maxOverride,
}: {
  title: string;
  data: Counted[];
  /** Per-label fill; falls back to the single magnitude hue. */
  fills?: Record<string, string>;
  unit?: string;
  emptyMessage?: string;
  max?: number;
}) {
  const max = maxOverride ?? Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.1em] text-navy">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-slate">{emptyMessage}</p>
      ) : (
        <table className="w-full border-collapse">
          <caption className="sr-only">{title}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Label</th>
              <th scope="col">Count</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const pct = total ? Math.round((d.count / total) * 100) : 0;
              return (
                <tr key={d.label}>
                  <th
                    scope="row"
                    className="w-[38%] max-w-0 truncate py-1.5 pr-3 text-left text-sm font-semibold text-navy"
                    title={d.label}
                  >
                    {d.label}
                  </th>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 min-w-0 flex-1 rounded-full bg-paper">
                        <div
                          className="h-2.5 rounded-full"
                          style={{
                            width: `${Math.max(2, (d.count / max) * 100)}%`,
                            background: fills?.[d.label] ?? MAGNITUDE_FILL,
                          }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-slate">
                        <span className="font-semibold text-navy">
                          {d.count.toLocaleString()}
                          {unit}
                        </span>
                        {total ? <span className="ml-1 text-xs">{pct}%</span> : null}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function MonthlyColumns({
  title,
  data,
}: {
  title: string;
  data: { month: string; count: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.1em] text-navy">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-slate">No dated assessments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <caption className="sr-only">{title}</caption>
            <tbody>
              <tr className="align-bottom">
                {data.map((d) => (
                  <td key={d.month} className="px-1 align-bottom">
                    <div className="flex h-36 flex-col justify-end">
                      <div className="mb-1 text-center text-xs font-semibold tabular-nums text-navy">
                        {d.count}
                      </div>
                      <div
                        className="mx-auto w-full max-w-10 rounded-t-[4px]"
                        style={{
                          height: `${Math.max(2, (d.count / max) * 100)}%`,
                          background: MAGNITUDE_FILL,
                        }}
                      />
                    </div>
                  </td>
                ))}
              </tr>
              <tr className="border-t border-line">
                {data.map((d) => (
                  <th
                    key={d.month}
                    scope="col"
                    className="px-1 pt-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate"
                  >
                    {formatMonth(d.month)}
                  </th>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", { month: "short" });
  return m === 1 ? `${name} ${String(y).slice(2)}` : name;
}
