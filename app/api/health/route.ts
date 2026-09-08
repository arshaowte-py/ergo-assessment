import { NextRequest } from "next/server";
import { env, privateKeyFingerprint, privateKeyStatus } from "@/lib/env";
import { driveIdentity } from "@/lib/google";
import { storageBackend } from "@/lib/storage";
import { bucketStatus } from "@/lib/supabase";
import { describeError, jsonResponse, preflight } from "@/lib/http";
import { sheetStatus } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Equivalent of the old Apps Script doGet() — confirms the relay is wired up. */
export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  const config = {
    serviceAccount: Boolean(env.serviceAccountEmail),
    privateKey: privateKeyStatus(),
    privateKeyFingerprint: privateKeyFingerprint(),
    // Bumped when the diagnostics change, so a stale deployment is obvious.
    healthVersion: 2,
    sheetId: Boolean(env.sheetId),
    storage: storageBackend(),
    driveFolder: Boolean(env.driveFolderId),
    driveAuth: driveIdentity(),
    adminPassword: Boolean(env.adminPassword),
    apiSecret: Boolean(env.apiSecret),
    pdfEngine: env.pdfEngine,
    allowedOrigins: env.allowedOrigins,
  };

  // Only meaningful on the Supabase path; a failure here must not mask the
  // sheet check below, which is the more important signal.
  let bucket: Awaited<ReturnType<typeof bucketStatus>> | "unreachable" | null = null;
  if (storageBackend() === "supabase") {
    bucket = await bucketStatus().catch(() => "unreachable" as const);
  }

  try {
    const status = await sheetStatus();
    return jsonResponse(req, {
      ok: true,
      msg: "Frido Ergo backend is live",
      ...status,
      config: { ...config, bucket },
    });
  } catch (err) {
    return jsonResponse(
      req,
      { ok: false, error: describeError(err), config: { ...config, bucket } },
      { status: 500 },
    );
  }
}
