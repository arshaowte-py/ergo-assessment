import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { checkApiSecret, describeError, errorResponse, jsonResponse, preflight } from "@/lib/http";
import { parseFilters, queryAssessments } from "@/lib/query";
import { computeStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated()) && !checkApiSecret(req)) {
    return errorResponse(req, "Unauthorized", 401);
  }
  try {
    const result = await queryAssessments({
      filters: parseFilters(req.nextUrl.searchParams),
      limit: null,
    });
    return jsonResponse(req, { ok: true, stats: computeStats(result.rows) });
  } catch (err) {
    return errorResponse(req, describeError(err), 500);
  }
}
