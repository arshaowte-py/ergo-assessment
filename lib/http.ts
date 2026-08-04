import { NextRequest, NextResponse } from "next/server";
import { env } from "./env";

/**
 * The portal is served from Netlify, this API from Vercel, so every portal call
 * is cross-origin. Only origins in ALLOWED_ORIGINS get an ACAO header back.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = env.allowedOrigins;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export function jsonResponse(
  req: NextRequest,
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: {
      ...corsHeaders(req.headers.get("origin")),
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

export function preflight(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export function errorResponse(
  req: NextRequest,
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
): NextResponse {
  return jsonResponse(req, { ok: false, error: message, ...extra }, { status });
}

/**
 * Optional shared-secret gate for write endpoints. Accepts the secret in the
 * X-Api-Secret header or as a `token` field in the body (the portal's original
 * Apps Script contract used the body form).
 */
export function checkApiSecret(req: NextRequest, bodyToken?: unknown): boolean {
  const expected = env.apiSecret;
  if (!expected) return true;
  const header = req.headers.get("x-api-secret");
  return safeEqual(header ?? "", expected) || safeEqual(String(bodyToken ?? ""), expected);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
