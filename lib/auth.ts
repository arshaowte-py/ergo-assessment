import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * Deliberately small: one shared password, one HMAC-signed cookie. Enough to
 * keep customer data off the open web; swap for real accounts when the team
 * needs per-physio logins.
 */

export const SESSION_COOKIE = "ergo_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret || "ergo-dev-secret")
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(): string {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `admin.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [subject, expiresRaw, signature] = parts;
  const expected = sign(`${subject}.${expiresRaw}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const expires = Number(expiresRaw);
  return Number.isFinite(expires) && expires > Date.now();
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProd,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

/** Server-component helper: is the current request signed in? */
export async function isAuthenticated(): Promise<boolean> {
  // No password configured means the gate is open — surfaced as a warning in
  // the admin header so it can't be left that way by accident in production.
  if (!env.adminPassword) return true;
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export function isAuthGateDisabled(): boolean {
  return !env.adminPassword;
}
