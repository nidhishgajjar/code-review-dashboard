import { NextResponse } from "next/server";
import { loadReviews } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const size = Math.min(
    Math.max(1, parseInt(url.searchParams.get("size") ?? "20", 10) || 20),
    50,
  );
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const { rows, total } = await loadReviews({
    limit: size,
    offset: (page - 1) * size,
  });
  return NextResponse.json({
    reviews: rows,
    total,
    page,
    size,
    total_pages: Math.max(1, Math.ceil(total / size)),
    last_review_ts: rows[0]?.reviewed_at ?? null,
  });
}
