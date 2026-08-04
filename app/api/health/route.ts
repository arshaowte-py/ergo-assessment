import { NextRequest } from "next/server";
import { env, privateKeyStatus } from "@/lib/env";
import { driveIdentity } from "@/lib/google";
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
    sheetId: Boolean(env.sheetId),
    driveFolder: Boolean(env.driveFolderId),
    driveAuth: driveIdentity(),
    adminPassword: Boolean(env.adminPassword),
    apiSecret: Boolean(env.apiSecret),
    pdfEngine: env.pdfEngine,
    allowedOrigins: env.allowedOrigins,
  };

  try {
    const status = await sheetStatus();
    return jsonResponse(req, {
      ok: true,
      msg: "Frido Ergo backend is live",
      ...status,
      config,
    });
  } catch (err) {
    return jsonResponse(
      req,
      { ok: false, error: describeError(err), config },
      { status: 500 },
    );
  }
}
