import { createHash, createPrivateKey } from "node:crypto";

/** Central, validated access to configuration. */

function read(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    return "";
  }
  return v;
}

/**
 * Accept the private key in whatever shape it arrives.
 *
 * A PEM key pasted into a dashboard field gets mangled in a handful of
 * predictable ways, and every one of them surfaces as the same opaque
 * `error:1E08010C:DECODER routines::unsupported`. Rather than make the operator
 * guess, normalise them all: the whole service-account JSON, wrapping quotes,
 * single- or double-escaped newlines, base64, and a body whose line breaks were
 * lost entirely.
 */
function normalisePrivateKey(raw: string): string {
  let key = raw.trim();
  if (!key) return "";

  // The entire service-account JSON pasted into the field.
  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") key = parsed.private_key.trim();
    } catch {
      /* not JSON after all — keep going */
    }
  }

  // Wrapping quotes, possibly more than one layer deep.
  while (
    key.length > 1 &&
    ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))
  ) {
    key = key.slice(1, -1).trim();
  }

  // `\\n` (double-escaped by a shell or a second JSON round-trip) then `\n`.
  key = key.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");

  if (!key.includes("BEGIN")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("BEGIN")) key = decoded;
    } catch {
      /* not base64 — fall through and let auth fail loudly */
    }
  }

  // Rebuild the PEM from its base64 body. OpenSSL wants the header, 64-char
  // lines, and the footer; a key whose newlines were flattened to spaces (or
  // lost) decodes fine once it is re-wrapped.
  const pem = key.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/);
  if (!pem) return key;
  const body = pem[2].replace(/[^A-Za-z0-9+/=]/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${pem[1]}-----\n${lines.join("\n")}\n-----END ${pem[1]}-----\n`;
}

export const env = {
  get serviceAccountEmail() {
    return read("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  },
  get privateKey() {
    return normalisePrivateKey(read("GOOGLE_PRIVATE_KEY"));
  },
  get sheetId() {
    return read("SHEET_ID");
  },
  get sheetTab() {
    return read("SHEET_TAB", "Assessments");
  },
  get driveFolderId() {
    return read("DRIVE_FOLDER_ID");
  },
  /**
   * OAuth credentials for a real Google account, used only for Drive uploads.
   * Service accounts get no Drive storage quota, so file creation 403s unless
   * the folder is on a Shared Drive (Workspace only).
   */
  get oauthClientId() {
    return read("GOOGLE_OAUTH_CLIENT_ID");
  },
  get oauthClientSecret() {
    return read("GOOGLE_OAUTH_CLIENT_SECRET");
  },
  get oauthRefreshToken() {
    return read("GOOGLE_OAUTH_REFRESH_TOKEN");
  },
  /**
   * Supabase Storage. When both of these are set they take over from Drive for
   * photos and report PDFs — no quota, no consent screen, no expiring token.
   */
  get supabaseUrl() {
    return read("SUPABASE_URL");
  },
  get supabaseServiceKey() {
    return read("SUPABASE_SERVICE_ROLE_KEY");
  },
  get supabaseBucket() {
    return read("SUPABASE_BUCKET", "ergo-assessments");
  },
  get adminPassword() {
    return read("ADMIN_PASSWORD");
  },
  /** Optional shared secret the portal sends as `token`. Empty = no check. */
  get apiSecret() {
    return read("API_SECRET");
  },
  /** Secret used to sign the admin session cookie. Falls back to the password. */
  get sessionSecret() {
    return read("SESSION_SECRET") || read("ADMIN_PASSWORD");
  },
  /** Comma-separated list; `*` allows any origin. */
  get allowedOrigins(): string[] {
    return read("ALLOWED_ORIGINS", "https://frido-ergoassessment.netlify.app")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  /** "chromium" | "drive" | "auto" */
  get pdfEngine() {
    return read("PDF_ENGINE", "auto").toLowerCase();
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};

/**
 * Report whether the configured key actually parses, without ever revealing it.
 * `DECODER routines::unsupported` from deep inside the auth library tells the
 * operator nothing; this names the problem at /api/health.
 */
export function privateKeyStatus(): string {
  const key = env.privateKey;
  if (!key) return "missing";
  if (!key.includes("BEGIN")) return "invalid: no PEM header found";
  try {
    createPrivateKey(key);
    return "valid";
  } catch (err) {
    return `invalid: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Identify *which* key value the deployment loaded, without revealing it.
 *
 * A hash of the base64 body plus its length is enough to tell "the right key,
 * mangled in transit" (correct length, correct hash) from "the wrong string
 * entirely" — a truncated paste, or the `MIIE...` placeholder out of
 * .env.example, both of which produce the same opaque DECODER error.
 */
export function privateKeyFingerprint(): { length: number; sha256: string } | null {
  const key = env.privateKey;
  if (!key) return null;
  const match = key.match(/-----BEGIN[^-]*-----([\s\S]*?)-----END/);
  const body = (match ? match[1] : key).replace(/[^A-Za-z0-9+/=]/g, "");
  return {
    length: body.length,
    sha256: createHash("sha256").update(body).digest("hex").slice(0, 12),
  };
}

/** Throws a readable error rather than letting the Google client fail cryptically. */
export function assertGoogleConfig(): void {
  const missing: string[] = [];
  if (!env.serviceAccountEmail) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!env.privateKey) missing.push("GOOGLE_PRIVATE_KEY");
  if (!env.sheetId) missing.push("SHEET_ID");
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
