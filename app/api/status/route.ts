import { NextResponse } from "next/server";
import { getAgents } from "@/lib/config";
import { fetchAgentState } from "@/lib/orb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const agents = getAgents();
  const states = await Promise.all(
    agents.map(async (a) => ({
      id: a.id,
      computer_id: a.computer_id,
      url: a.url,
      repos: a.repos,
      state: await fetchAgentState(a.computer_id),
    })),
  );
  const awake = states.filter((s) => s.state === "running" || s.state === "frozen").length;
  return NextResponse.json({
    agents: states,
    awake_count: awake,
    total_agents: agents.length,
  });
}
