import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { BandPill, StagePill } from "@/components/pills";
import { displayValue, isoDate, photoCountLabel, toNumber } from "@/lib/format";
import { parseFilters, queryAssessments, SortDir, SortKey } from "@/lib/query";
import { AssessmentRow } from "@/lib/schema";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: null, label: "Assessment ID" },
  { key: "date", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "physio", label: "Physio" },
  { key: "store", label: "Store / City" },
  { key: "rosa", label: "ROSA", className: "text-right" },
  { key: "band", label: "Band" },
  { key: "stage", label: "Stage" },
  { key: null, label: "Photos", className: "text-right" },
  { key: null, label: "Report" },
];

export default async function AdminListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = toURLSearchParams(sp);
  const filters = parseFilters(params);
  const sort = (params.get("sort") ?? "date") as SortKey;
  const dir: SortDir = params.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(params.get("page")) || 1);

  let result;
  try {
    result = await queryAssessments({
      filters,
      sort,
      dir,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
  } catch (err) {
    return <ErrorCard message={err instanceof Error ? err.message : String(err)} />;
  }

  const pages = Math.max(1, Math.ceil(result.filtered / PAGE_SIZE));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy">Assessments</h1>
        <p className="text-sm text-slate">
          {result.filtered.toLocaleString()} of {result.total.toLocaleString()} rows
        </p>
      </div>

      <FilterBar filters={filters} facets={result.facets} sort={sort} dir={dir} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate ${col.className ?? ""}`}
                >
                  {col.key ? (
                    <SortLink
                      params={params}
                      column={col.key}
                      label={col.label}
                      sort={sort}
                      dir={dir}
                    />
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-slate">
                  No assessments match these filters.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => <Row key={String(row["Assessment ID"])} row={row} />)
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm">
          <PageLink params={params} page={page - 1} disabled={page <= 1}>
            ← Previous
          </PageLink>
          <span className="text-slate">
            Page {page} of {pages}
          </span>
          <PageLink params={params} page={page + 1} disabled={page >= pages}>
            Next →
          </PageLink>
        </nav>
      ) : null}
    </>
  );
}

function Row({ row }: { row: AssessmentRow }) {
  const id = String(row["Assessment ID"] ?? "");
  const rosa = toNumber(row["FINAL ROSA"]);
  const pdf = String(row["Report PDF"] ?? "").trim();

  return (
    <tr className="border-b border-line/60 last:border-0 hover:bg-paper/70">
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
        <Link href={`/admin/${encodeURIComponent(id)}`} className="font-semibold text-blue hover:underline">
          {id || "—"}
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate">{isoDate(row["Date"]) || "—"}</td>
      <td className="px-3 py-2.5 font-semibold text-navy">{displayValue(row["Customer"])}</td>
      <td className="px-3 py-2.5 text-slate">{displayValue(row["Physiotherapist"])}</td>
      <td className="px-3 py-2.5 text-slate">{displayValue(row["Store / City"])}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
        {rosa === null ? "—" : rosa}
      </td>
      <td className="px-3 py-2.5">
        <BandPill value={row["Band"]} />
      </td>
      <td className="px-3 py-2.5">
        <StagePill value={row["Stage"]} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate">
        {photoCountLabel(row)}
      </td>
      <td className="px-3 py-2.5">
        {pdf ? (
          <a
            href={pdf}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-blue hover:underline"
          >
            PDF ↗
          </a>
        ) : (
          <span className="text-slate">—</span>
        )}
      </td>
    </tr>
  );
}

function SortLink({
  params,
  column,
  label,
  sort,
  dir,
}: {
  params: URLSearchParams;
  column: SortKey;
  label: string;
  sort: SortKey;
  dir: SortDir;
}) {
  const active = sort === column;
  const nextDir = active && dir === "desc" ? "asc" : "desc";
  const next = new URLSearchParams(params);
  next.set("sort", column);
  next.set("dir", nextDir);
  next.delete("page");
  return (
    <Link href={`/admin?${next.toString()}`} className="hover:text-navy">
      {label}
      <span className={active ? "ml-1 text-navy" : "ml-1 opacity-0"}>
        {dir === "asc" ? "▲" : "▼"}
      </span>
    </Link>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: URLSearchParams;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-slate/50">{children}</span>;
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return (
    <Link href={`/admin?${next.toString()}`} className="btn-ghost">
      {children}
    </Link>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="card border-red/40 bg-red-soft p-5">
      <h2 className="mb-1 font-bold text-red">Could not read the Google Sheet</h2>
      <p className="mb-3 text-sm text-navy">{message}</p>
      <p className="text-sm text-slate">
        Check that the service account is set up and that the Sheet and Drive folder are
        shared with it as an Editor. <code className="font-mono text-xs">/api/health</code>{" "}
        reports which env vars are present.
      </p>
    </div>
  );
}

function toURLSearchParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v.length) params.set(k, v[0]);
  }
  return params;
}
