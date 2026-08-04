import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { driveThumbnailUrl } from "@/lib/drive";
import { parseKeyed, parsePain, parseProducts, photoLinks, splitList } from "@/lib/format";
import { checkApiSecret, describeError, errorResponse, jsonResponse, preflight } from "@/lib/http";
import { isValidAssessmentId } from "@/lib/schema";
import { findRowById } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated()) && !checkApiSecret(req)) {
    return errorResponse(req, "Unauthorized", 401);
  }

  const { id } = await ctx.params;
  if (!isValidAssessmentId(id)) return errorResponse(req, "Invalid assessment id", 400);

  try {
    const found = await findRowById(id);
    if (!found) return errorResponse(req, `No assessment with id ${id}`, 404);

    const { row } = found;
    return jsonResponse(req, {
      ok: true,
      id,
      rowNumber: found.rowNumber,
      assessment: row,
      // Pre-parsed views of the semicolon-packed columns, so consumers don't
      // have to re-implement the portal's formatting rules.
      parsed: {
        photos: photoLinks(row).map((p) => ({
          ...p,
          thumbnailUrl: driveThumbnailUrl(p.url),
        })),
        reportPdf: String(row["Report PDF"] ?? "") || null,
        pain: parsePain(row["All pain"]),
        products: parseProducts(row["Products"]),
        conditions: splitList(row["Conditions"]),
        reasons: splitList(row["Reasons"]),
        redFlags: splitList(row["Red flags"]),
        onSpot: splitList(row["On-spot"]),
        workChanges: splitList(row["Work changes"]),
        habitChanges: splitList(row["Habit changes"]),
        owns: splitList(row["Owns"]),
        setup: splitList(row["Setup"]),
        referrals: splitList(row["Referrals"]),
        workspaceQ: parseKeyed(row["Workspace Q"]),
        filledBy: parseKeyed(row["Filled by"]),
      },
    });
  } catch (err) {
    return errorResponse(req, describeError(err), 500);
  }
}
