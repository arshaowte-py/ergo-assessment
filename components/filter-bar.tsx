import { AssessmentFilters } from "@/lib/query";

/**
 * A plain GET form — no client JS. Every filter lands in the URL, so a filtered
 * view is shareable and the back button behaves.
 */
export function FilterBar({
  filters,
  facets,
  sort,
  dir,
}: {
  filters: AssessmentFilters;
  facets: { physios: string[]; stores: string[]; bands: string[]; stages: string[] };
  sort: string;
  dir: string;
}) {
  return (
    <form method="get" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-7">
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="dir" value={dir} />

      <Field label="Search" className="lg:col-span-2">
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Name, ID, phone, email"
          className="field"
        />
      </Field>

      <Field label="Physio">
        <Select name="physio" value={filters.physio} options={facets.physios} />
      </Field>

      <Field label="Store / City">
        <Select name="store" value={filters.store} options={facets.stores} />
      </Field>

      <Field label="Band">
        <Select name="band" value={filters.band} options={["LOW", "MODERATE", "HIGH"]} />
      </Field>

      <Field label="Stage">
        <Select
          name="stage"
          value={filters.stage}
          options={facets.stages.length ? facets.stages : ["Draft", "Submitted", "Report ready"]}
        />
      </Field>

      <Field label="From">
        <input type="date" name="from" defaultValue={filters.from ?? ""} className="field" />
      </Field>

      <Field label="To">
        <input type="date" name="to" defaultValue={filters.to ?? ""} className="field" />
      </Field>

      <div className="flex items-end gap-2 lg:col-span-2">
        <button type="submit" className="btn-primary">
          Apply
        </button>
        <a href="/admin" className="btn-ghost">
          Reset
        </a>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Select({
  name,
  value,
  options,
}: {
  name: string;
  value?: string;
  options: string[];
}) {
  return (
    <select name={name} defaultValue={value ?? ""} className="field">
      <option value="">All</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
