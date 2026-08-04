import Link from "next/link";
import { notFound } from "next/navigation";
import { BandPill, StagePill } from "@/components/pills";
import { driveThumbnailUrl } from "@/lib/drive";
import {
  displayValue,
  formatDateTime,
  isoDate,
  parseKeyed,
  parsePain,
  parseProducts,
  photoLinks,
  splitList,
  toNumber,
} from "@/lib/format";
import { AssessmentRow, isValidAssessmentId } from "@/lib/schema";
import { findRowById } from "@/lib/sheet";

export const dynamic = "force-dynamic";

const PHOTO_LABELS: Record<string, string> = {
  side: "Side angle",
  above: "From above",
  back: "From behind",
  seated: "Seated posture",
};

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidAssessmentId(id)) notFound();

  const found = await findRowById(id);
  if (!found) notFound();
  const row = found.row;

  const rosa = toNumber(row["FINAL ROSA"]);
  const pdf = String(row["Report PDF"] ?? "").trim();
  const photos = photoLinks(row);
  const pain = parsePain(row["All pain"]);
  const products = parseProducts(row["Products"]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <div>
          <Link href="/admin" className="text-sm font-semibold text-blue hover:underline">
            ← All assessments
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-navy">
            {displayValue(row["Customer"])}
          </h1>
          <p className="font-mono text-xs text-slate">{id}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <StagePill value={row["Stage"]} />
          <BandPill value={row["Band"]} />
          {pdf ? (
            <a href={pdf} target="_blank" rel="noreferrer noopener" className="btn-primary">
              Open report PDF ↗
            </a>
          ) : (
            <span className="btn-ghost cursor-default text-slate">No report yet</span>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Final ROSA" value={rosa === null ? "—" : String(rosa)} />
        <Stat label="Chair ROSA" value={displayValue(row["Chair ROSA"])} />
        <Stat label="Section B" value={displayValue(row["Section B"])} />
        <Stat label="Section C" value={displayValue(row["Section C"])} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Session">
            <Grid
              items={[
                ["Date", isoDate(row["Date"])],
                ["Session type", row["Session type"]],
                ["Store / City", row["Store / City"]],
                ["Physiotherapist", row["Physiotherapist"]],
                ["Submitted at", formatDateTime(row["Submitted at"])],
                ["Last updated", formatDateTime(row["Last updated"])],
              ]}
            />
          </Section>

          <Section title="Customer">
            <Grid
              items={[
                ["Age", row["Age"]],
                ["Gender", row["Gender"]],
                ["Phone", row["Phone"]],
                ["Email", row["Email"]],
                ["Occupation", row["Occupation"]],
                ["Company", row["Company"]],
                ["Height (cm)", row["Height cm"]],
                ["Weight (kg)", row["Weight kg"]],
                ["Consent", row["Consent"]],
                ["Photo consent", row["Photo consent"]],
              ]}
            />
          </Section>

          <Section title="Work & habits">
            <Grid
              items={[
                ["Work mode", row["Work mode"]],
                ["Device", row["Device"]],
                ["Work h/day", row["Work h/day"]],
                ["Sitting h/day", row["Sitting h/day"]],
                ["Screen h/day", row["Screen h/day"]],
                ["Breaks", row["Breaks"]],
                ["Sitting bout", row["Sitting bout"]],
                ["Activity", row["Activity"]],
              ]}
            />
            <Tags title="Owns" values={splitList(row["Owns"])} />
            <Tags title="Setup" values={splitList(row["Setup"])} />
            <Tags title="Conditions" values={splitList(row["Conditions"])} />
            {String(row["Other conditions"] ?? "").trim() ? (
              <Note title="Other conditions">{String(row["Other conditions"])}</Note>
            ) : null}
          </Section>

          <Section title="Pain & red flags">
            <Tags title="Reasons for visit" values={splitList(row["Reasons"])} />
            {pain.length ? (
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <Th>Area</Th>
                    <Th className="w-20 pr-3 text-right">Score</Th>
                    <Th className="w-2/5 pl-3">Duration</Th>
                  </tr>
                </thead>
                <tbody>
                  {pain.map((p, i) => (
                    <tr key={`${p.area}-${i}`} className="border-b border-line/60 last:border-0">
                      <td className="py-2 pr-3 font-semibold text-navy">{p.area}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {p.score === null ? "—" : `${p.score}/10`}
                      </td>
                      <td className="py-2 pl-3 text-slate">{p.duration || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No pain points recorded.</Empty>
            )}
            {splitList(row["Red flags"]).length ? (
              <div className="mt-3 rounded-lg border border-red/30 bg-red-soft p-3">
                <div className="label text-red">Red flags</div>
                <ul className="mt-1 list-inside list-disc text-sm text-navy">
                  {splitList(row["Red flags"]).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>

          <Section title="Recommendations">
            <Tags title="On-spot corrections" values={splitList(row["On-spot"])} />
            <Tags title="Workstation changes" values={splitList(row["Work changes"])} />
            <Tags title="Habit changes" values={splitList(row["Habit changes"])} />
          </Section>

          <Section title="Products recommended">
            {products.length ? (
              <ol className="space-y-2">
                {products.map((p) => (
                  <li
                    key={`${p.rank}-${p.name}`}
                    className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-navy">
                      {p.rank}
                    </span>
                    <span className="font-semibold text-navy">{p.name}</span>
                    {p.intent ? (
                      <span className="pill ml-auto bg-blue-soft text-blue">{p.intent}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>No products recommended.</Empty>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section title={`Photos (${displayValue(row["Photo count"])})`}>
            {photos.length ? (
              <div className="grid grid-cols-2 gap-3">
                {photos.map((p) => {
                  const thumb = driveThumbnailUrl(p.url, 800);
                  return (
                    <a
                      key={p.angle}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group block overflow-hidden rounded-lg border border-line"
                    >
                      {/* Drive's viewer page can't be embedded, so we point at
                          the thumbnail endpoint. Drawn as a background image so
                          a photo that isn't publicly readable degrades to the
                          placeholder tile instead of a broken-image icon. */}
                      <div
                        className="grid aspect-[3/4] place-items-center bg-paper bg-cover bg-center text-xs text-slate"
                        style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                        role="img"
                        aria-label={PHOTO_LABELS[p.angle] ?? p.angle}
                      />

                      <div className="px-2 py-1.5 text-[11px] font-semibold text-slate group-hover:text-navy">
                        {PHOTO_LABELS[p.angle] ?? p.angle} ↗
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <Empty>No photos uploaded.</Empty>
            )}
          </Section>

          <Section title="Follow-up">
            <Grid
              items={[
                ["Type", row["Follow-up type"]],
                ["Date", isoDate(row["Follow-up date"])],
                ["Outcome", row["Outcome"]],
                ["Purchase", row["Purchase"]],
                ["Order / Invoice", row["Order/Invoice"]],
                ["Voucher", row["Voucher"]],
              ]}
              columns={1}
            />
          </Section>

          <Section title="Fee">
            <Grid
              items={[
                ["Status", row["Fee status"]],
                ["Amount", row["Fee amount"]],
                ["Voucher code", row["Voucher code"]],
              ]}
              columns={1}
            />
          </Section>

          <Section title="Workspace observations">
            <KeyedList value={row["Workspace Q"]} />
          </Section>

          <Section title="Filled by">
            <KeyedList value={row["Filled by"]} />
          </Section>

          {splitList(row["Referrals"]).length ? (
            <Section title="Referrals">
              <Tags values={splitList(row["Referrals"])} />
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.1em] text-navy">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-navy">{value}</div>
    </div>
  );
}

function Grid({
  items,
  columns = 2,
}: {
  items: [string, unknown][];
  columns?: 1 | 2;
}) {
  return (
    <dl className={`grid gap-x-6 gap-y-3 ${columns === 1 ? "" : "sm:grid-cols-2"}`}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="label">{label}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-navy">{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tags({ title, values }: { title?: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="mt-3 first:mt-0">
      {title ? <div className="label mb-1.5">{title}</div> : null}
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="rounded-md bg-paper px-2 py-1 text-xs font-medium text-navy">
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function KeyedList({ value }: { value: unknown }) {
  const items = parseKeyed(value);
  if (!items.length) return <Empty>Nothing recorded.</Empty>;
  return (
    <dl className="space-y-2">
      {items.map((kv) => (
        <div key={kv.key} className="flex items-baseline gap-3">
          <dt className="label shrink-0">{kv.key}</dt>
          <dd className="ml-auto text-right text-sm font-semibold text-navy">{kv.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg bg-paper p-3">
      <div className="label">{title}</div>
      <p className="mt-1 text-sm text-navy">{children}</p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`pb-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate ${className}`}
    >
      {children}
    </th>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate">{children}</p>;
}
