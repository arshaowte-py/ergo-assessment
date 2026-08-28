import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { checkApiSecret, describeError, errorResponse, jsonResponse, preflight } from "@/lib/http";
import { parseFilters, queryAssessments, SortDir, SortKey } from "@/lib/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORT_KEYS: SortKey[] = ["date", "customer", "physio", "store", "rosa", "band", "stage"];

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  // Either an admin session cookie or the shared API secret gets you in.
  if (!(await isAuthenticated()) && !checkApiSecret(req)) {
    return errorResponse(req, "Unauthorized", 401);
  }

  const params = req.nextUrl.searchParams;
  const sortParam = params.get("sort") as SortKey | null;
  const sort = sortParam && SORT_KEYS.includes(sortParam) ? sortParam : "date";
  const dir: SortDir = params.get("dir") === "asc" ? "asc" : "desc";

  const limitRaw = params.get("limit");
  const limit = limitRaw === null || limitRaw === "" ? null : Math.max(0, Number(limitRaw) || 0);
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  try {
    const result = await queryAssessments({
      filters: parseFilters(params),
      sort,
      dir,
      limit,
      offset,
    });
    return jsonResponse(req, {
      ok: true,
      count: result.rows.length,
      filtered: result.filtered,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      facets: result.facets,
      assessments: result.rows,
    });
  } catch (err) {
    return errorResponse(req, describeError(err), 500);
  }
}
