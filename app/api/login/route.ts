import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Form post from /login. Redirects rather than returning JSON so it works without JS. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = sanitizeNext(String(form.get("next") ?? "/admin"));

  if (!env.adminPassword || !safeEqual(password, env.adminPassword)) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("error", "1");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin), { status: 303 });
  res.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
  return res;
}

/** Only allow same-app relative paths, so `?next=` can't become an open redirect. */
function sanitizeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/admin";
}
