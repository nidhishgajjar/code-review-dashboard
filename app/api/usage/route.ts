import { NextResponse } from "next/server";
import { fetchUsage } from "@/lib/orb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RUNTIME_RATE_USD_PER_GB_HR = 0.005;
const DISK_RATE_USD_PER_GB_MONTH = 0.05;

export async function GET() {
  const usage = await fetchUsage();
  if (!usage) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const runtime_cost = usage.runtime_gb_hours * RUNTIME_RATE_USD_PER_GB_HR;
  // disk rate is per GB-month; convert approximately using 30-day window
  const disk_cost = (usage.disk_gb_hours / (30 * 24)) * DISK_RATE_USD_PER_GB_MONTH;

  return NextResponse.json({
    ...usage,
    runtime_cost_usd: Number(runtime_cost.toFixed(2)),
    disk_cost_usd: Number(disk_cost.toFixed(2)),
    total_cost_usd: Number((runtime_cost + disk_cost).toFixed(2)),
  });
}
