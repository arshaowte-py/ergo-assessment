import { NextRequest } from "next/server";
import { checkApiSecret, describeError, errorResponse, jsonResponse, preflight } from "@/lib/http";
import { renderReportPdf, reportFileName } from "@/lib/pdf";
import { photoPath, putFile, reportPath, storageBackend, storageConfigured } from "@/lib/storage";
import { AssessmentRow, isValidAssessmentId, PHOTO_ANGLES, PHOTO_HEADERS, PhotoAngle, sanitizeRow } from "@/lib/schema";
import { upsertRow } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SubmitBody = {
  token?: string;
  row?: unknown;
  photos?: Record<string, string>;
  reportHTML?: string;
};

type PhotoUpload = { angle: PhotoAngle; mimeType: string; data: Buffer };

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return errorResponse(req, "Body must be JSON", 400);
  }

  if (!checkApiSecret(req, body.token)) {
    return errorResponse(req, "Unauthorized", 401);
  }

  const row = sanitizeRow(body.row);
  const id = String(row["Assessment ID"] ?? "").trim();
  if (!isValidAssessmentId(id)) {
    return errorResponse(req, 'Payload is missing a valid "Assessment ID"', 400);
  }

  // Non-fatal problems are reported alongside a successful row write — a failed
  // photo upload must never cost us the assessment data itself.
  const warnings: string[] = [];

  const photos = decodePhotos(body.photos, warnings);
  if (photos.length && storageConfigured()) {
    const results = await Promise.allSettled(
      photos.map((p) =>
        putFile({
          path: photoPath(id, p.angle),
          fileName: `${id}_${p.angle}.jpg`,
          mimeType: p.mimeType,
          data: p.data,
        }).then((link) => ({ angle: p.angle, link })),
      ),
    );
    results.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value.link) {
        row[PHOTO_HEADERS[res.value.angle]] = res.value.link;
      } else if (res.status === "rejected") {
        warnings.push(`photo:${photos[i].angle}: ${describeError(res.reason)}`);
      }
    });
  } else if (photos.length) {
    warnings.push("photos skipped: no storage backend configured");
  }

  const reportHtml = typeof body.reportHTML === "string" ? body.reportHTML.trim() : "";
  if (reportHtml && storageConfigured()) {
    try {
      const name = reportFileName(
        String(row["Customer"] ?? ""),
        String(row["Date"] ?? ""),
        id,
      );
      const { buffer, engine } = await renderReportPdf(reportHtml, name.replace(/\.pdf$/, ""));
      const link = await putFile({
        path: reportPath(id, name),
        fileName: name,
        mimeType: "application/pdf",
        data: buffer,
      });
      if (link) row["Report PDF"] = link;
      if (engine === "drive") warnings.push("report rendered with the Drive fallback engine");
    } catch (err) {
      warnings.push(`report pdf: ${describeError(err)}`);
    }
  } else if (reportHtml) {
    warnings.push("report skipped: no storage backend configured");
  }

  row["Last updated"] = new Date().toISOString();

  try {
    const result = await upsertRow(row);
    return jsonResponse(req, {
      ok: true,
      id,
      action: result.action,
      rowNumber: result.rowNumber,
      storage: storageBackend(),
      photos: photoLinkSummary(result.row),
      reportPdf: String(result.row["Report PDF"] ?? "") || null,
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (err) {
    return errorResponse(req, describeError(err), 500, { id, warnings });
  }
}

/** Turn the portal's `{side: "data:image/jpeg;base64,..."}` map into buffers. */
function decodePhotos(
  photos: Record<string, string> | undefined,
  warnings: string[],
): PhotoUpload[] {
  if (!photos || typeof photos !== "object") return [];
  const out: PhotoUpload[] = [];
  for (const angle of PHOTO_ANGLES) {
    const uri = photos[angle];
    if (typeof uri !== "string" || !uri) continue;
    const m = uri.match(/^data:([^;,]+);base64,(.+)$/);
    if (!m) {
      warnings.push(`photo:${angle}: not a base64 data URI`);
      continue;
    }
    try {
      out.push({ angle, mimeType: m[1], data: Buffer.from(m[2], "base64") });
    } catch (err) {
      warnings.push(`photo:${angle}: ${describeError(err)}`);
    }
  }
  return out;
}

function photoLinkSummary(row: AssessmentRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const angle of PHOTO_ANGLES) {
    const link = String(row[PHOTO_HEADERS[angle]] ?? "");
    if (link) out[angle] = link;
  }
  return out;
}
