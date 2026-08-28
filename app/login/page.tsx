import { redirect } from "next/navigation";
import { isAuthenticated, isAuthGateDisabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  if (await isAuthenticated()) redirect(next && next.startsWith("/") ? next : "/admin");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-1 text-2xl font-extrabold tracking-tight text-navy">
          Frido<span className="text-amber">.</span>
        </div>
        <h1 className="mb-5 text-sm font-bold uppercase tracking-[0.14em] text-slate">
          Ergo Assessment Admin
        </h1>

        {isAuthGateDisabled() ? (
          <p className="rounded-lg bg-red-soft p-3 text-sm text-red">
            ADMIN_PASSWORD is not set, so the dashboard is currently open to anyone
            with the URL. Set it in the Vercel project settings.
          </p>
        ) : null}

        <form action="/api/login" method="post" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next ?? "/admin"} />
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              className="field mt-1"
            />
          </div>
          {error ? (
            <p className="text-sm font-semibold text-red">Incorrect password.</p>
          ) : null}
          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
