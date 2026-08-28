import { JWT, OAuth2Client } from "google-auth-library";
import { assertGoogleConfig, env } from "./env";

/**
 * We talk to Sheets and Drive over plain REST instead of the `googleapis`
 * package. That package pulls in every Google API surface and blows up the
 * serverless bundle; here we only need ~6 endpoints, and the multipart Drive
 * upload is clearer written out than configured.
 */

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

let cachedClient: JWT | null = null;

function client(): JWT {
  assertGoogleConfig();
  if (!cachedClient) {
    cachedClient = new JWT({
      email: env.serviceAccountEmail,
      key: env.privateKey,
      scopes: SCOPES,
    });
  }
  return cachedClient;
}

let cachedOAuth: OAuth2Client | null = null;

/**
 * Drive uses a different identity from Sheets.
 *
 * Service accounts have no Drive storage quota — `files.create` fails with a
 * 403 no matter how the folder is shared — so uploads run as a real Google
 * account via an OAuth refresh token, and the files land in that account's
 * Drive. Sheets is unaffected: it edits an existing file rather than creating
 * one, so the service account is fine there.
 *
 * If OAuth isn't configured we fall back to the service account, which is the
 * right behaviour when the folder lives on a Shared Drive (where service
 * accounts do work).
 */
function oauthClient(): OAuth2Client | null {
  if (!env.oauthClientId || !env.oauthClientSecret || !env.oauthRefreshToken) return null;
  if (!cachedOAuth) {
    cachedOAuth = new OAuth2Client({
      clientId: env.oauthClientId,
      clientSecret: env.oauthClientSecret,
    });
    cachedOAuth.setCredentials({ refresh_token: env.oauthRefreshToken });
  }
  return cachedOAuth;
}

export function driveIdentity(): "oauth" | "service-account" {
  return oauthClient() ? "oauth" : "service-account";
}

/** Access tokens are cached and auto-refreshed by the underlying clients. */
export async function accessToken(): Promise<string> {
  const res = await client().getAccessToken();
  const token = typeof res === "string" ? res : res?.token;
  if (!token) throw new Error("Could not obtain a Google access token");
  return token;
}

export async function driveToken(): Promise<string> {
  const oauth = oauthClient();
  if (!oauth) return accessToken();
  try {
    const res = await oauth.getAccessToken();
    const token = typeof res === "string" ? res : res?.token;
    if (!token) throw new Error("empty token response");
    return token;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Drive OAuth refresh failed (${detail}). Re-run \`npm run auth:drive\` to mint a ` +
        "new GOOGLE_OAUTH_REFRESH_TOKEN — tokens issued while the OAuth consent " +
        'screen is in "Testing" expire after 7 days.',
    );
  }
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  /** Return the raw response instead of parsing JSON (used for PDF export). */
  raw?: boolean;
  /** Which identity to authenticate as. Drive uploads need the OAuth user. */
  auth?: "service-account" | "drive";
};

/** Authenticated fetch with one retry on transient 429/5xx. */
export async function googleFetch<T = unknown>(
  url: string,
  opts: RequestOptions = {},
): Promise<T> {
  const target = new URL(url);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) target.searchParams.set(k, String(v));
  }

  const attempt = async (): Promise<Response> => {
    const token = opts.auth === "drive" ? await driveToken() : await accessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    };
    let body = opts.body;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    }
    return fetch(target.toString(), {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
    });
  };

  let res = await attempt();
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 600));
    res = await attempt();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleApiError(
      `Google API ${res.status} on ${target.pathname}: ${text.slice(0, 400)}`,
      res.status,
      text,
    );
  }

  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
export const DRIVE_BASE = "https://www.googleapis.com/drive/v3/files";
export const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3/files";
