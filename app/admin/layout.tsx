import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated, isAuthGateDisabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The gate lives here rather than in middleware: the session cookie is signed
 * with node:crypto, which the edge middleware runtime doesn't provide.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login?next=/admin");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3">
          <Link href="/admin" className="text-xl font-extrabold tracking-tight text-navy">
            Frido<span className="text-amber">.</span>
          </Link>
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.14em] text-slate sm:block">
            Ergo Assessments
          </span>
          <nav className="ml-auto flex items-center gap-1">
            <Link
              href="/admin"
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-navy hover:bg-paper"
            >
              Assessments
            </Link>
            <Link
              href="/admin/stats"
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-navy hover:bg-paper"
            >
              Stats
            </Link>
            <form action="/api/logout" method="post">
              <button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate hover:bg-paper">
                Sign out
              </button>
            </form>
          </nav>
        </div>
        {isAuthGateDisabled() ? (
          <div className="bg-red-soft px-4 py-1.5 text-center text-xs font-semibold text-red">
            ADMIN_PASSWORD is not set — this dashboard is publicly accessible.
          </div>
        ) : null}
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
    </div>
  );
}
