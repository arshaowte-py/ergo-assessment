import { NextRequest } from "next/server";
import { uploadFile } from "@/lib/drive";
import { env } from "@/lib/env";
import { checkApiSecret, describeError, errorResponse, jsonResponse, preflight } from "@/lib/http";
import { AssessmentRow, isValidAssessmentId, PHOTO_ANGLES, PHOTO_HEADERS, PhotoAngle } from "@/lib/schema";
import { upsertRow } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One photo per request.
 *
 * Vercel caps a serverless request body at ~4.5MB. Four phone photos plus a
 * 60KB report normally fit, but sending them separately removes the cliff
 * entirely and lets a single failed upload retry on its own.
 */
export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  let body: { token?: string; id?: string; angle?: string; dataUrl?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, "Body must be JSON", 400);
  }

  if (!checkApiSecret(req, body.token)) return errorResponse(req, "Unauthorized", 401);

  const id = String(body.id ?? "").trim();
  if (!isValidAssessmentId(id)) return errorResponse(req, "Invalid or missing id", 400);

  const angle = String(body.angle ?? "") as PhotoAngle;
  if (!PHOTO_ANGLES.includes(angle)) {
    return errorResponse(req, `angle must be one of ${PHOTO_ANGLES.join(", ")}`, 400);
  }

  const m = String(body.dataUrl ?? "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) return errorResponse(req, "dataUrl must be a base64 data URI", 400);

  if (!env.driveFolderId) {
    return errorResponse(req, "DRIVE_FOLDER_ID is not configured", 500);
  }

  try {
    const file = await uploadFile({
      name: `${id}_${angle}.jpg`,
      mimeType: m[1],
      data: Buffer.from(m[2], "base64"),
    });
    const link = file.webViewLink ?? "";

    // A partial row: upsertRow merges it over whatever is already stored, so
    // this never clobbers assessment data written by /api/submit.
    const patch: AssessmentRow = {
      "Assessment ID": id,
      [PHOTO_HEADERS[angle]]: link,
      "Last updated": new Date().toISOString(),
    };
    const result = await upsertRow(patch);

    return jsonResponse(req, {
      ok: true,
      id,
      angle,
      link,
      photoCount: String(result.row["Photo count"] ?? ""),
    });
  } catch (err) {
    return errorResponse(req, describeError(err), 500, { id, angle });
  }
}
