import { BAND_FILL, BarList, MonthlyColumns, StatTile } from "@/components/charts";
import { FilterBar } from "@/components/filter-bar";
import { parseFilters, queryAssessments } from "@/lib/query";
import { computeStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      typeof v === "string" ? [[k, v] as [string, string]] : [],
    ),
  );
  const filters = parseFilters(params);

  let result;
  try {
    result = await queryAssessments({ filters, limit: null });
  } catch (err) {
    return (
      <div className="card border-red/40 bg-red-soft p-5">
        <h2 className="mb-1 font-bold text-red">Could not read the Google Sheet</h2>
        <p className="text-sm text-navy">{err instanceof Error ? err.message : String(err)}</p>
      </div>
    );
  }

  const stats = computeStats(result.rows);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">Stats</h1>
        <p className="text-sm text-slate">
          {stats.total.toLocaleString()} assessments in view
        </p>
      </div>

      <FilterBar filters={filters} facets={result.facets} sort="date" dir="desc" />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Assessments" value={stats.total.toLocaleString()} />
        <StatTile
          label="Average ROSA"
          value={stats.averageRosa === null ? "—" : String(stats.averageRosa)}
          hint={`across ${stats.rosaSampleSize} scored assessments`}
        />
        <StatTile
          label="Conversion"
          value={stats.conversion.answered ? pct(stats.conversion.rate) : "—"}
          hint={`${stats.conversion.purchased} purchased of ${stats.conversion.answered} answered`}
        />
        <StatTile
          label="Reports delivered"
          value={stats.total ? pct(stats.reportRate) : "—"}
          hint={`${stats.withReport} PDFs on file`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <BarList
          title="Risk band distribution"
          data={stats.bands}
          fills={BAND_FILL}
          emptyMessage="No banded assessments yet."
        />
        <BarList title="Stage" data={stats.stages} />
        <div className="lg:col-span-2">
          <MonthlyColumns title="Assessments over time" data={stats.overTime} />
        </div>
        <BarList title="By store / city" data={stats.stores} />
        <BarList title="By physiotherapist" data={stats.physios} />
        <div className="lg:col-span-2">
          <BarList
            title="Top products recommended"
            data={stats.products}
            emptyMessage="No product recommendations recorded yet."
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Full photo sets"
          value={String(stats.photoCoverage.withAllFour)}
          hint={`${stats.photoCoverage.withAny} assessments have at least one photo`}
        />
        <StatTile
          label="Fees collected"
          value={`₹${stats.feeCollected.toLocaleString("en-IN")}`}
          hint="rows with a fee status set"
        />
        <StatTile
          label="Stores covered"
          value={String(stats.stores.length)}
          hint={`${stats.physios.length} physiotherapists`}
        />
      </div>
    </>
  );
}
