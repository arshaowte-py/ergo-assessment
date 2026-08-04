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
 * Vercel's dashboard stores the key with literal `\n` sequences. Some setups
 * paste it wrapped in quotes, or base64-encoded. Normalise all three.
 */
function normalisePrivateKey(raw: string): string {
  let key = raw.trim();
  if (!key) return "";
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  if (!key.includes("BEGIN")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("BEGIN")) key = decoded;
    } catch {
      /* not base64 — fall through and let auth fail loudly */
    }
  }
  return key.replace(/\\n/g, "\n");
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
