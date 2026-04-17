import { NextResponse } from "next/server";
import { loadReviews } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 50);
  const reviews = await loadReviews(limit);
  return NextResponse.json({
    reviews,
    total: reviews.length,
    last_review_ts: reviews[0]?.reviewed_at ?? null,
  });
}
